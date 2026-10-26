/**
 * Token optimizer from the old Jessie agent.
 * Each user has a 100,000 token daily budget. Usage is logged, prompts are
 * compressed when they get long, and a large request is downgraded once
 * today's usage passes 90% of the budget.
 */

import * as vscode from 'vscode';

export const DAILY_TOKEN_BUDGET = 100_000;
export const NEAR_LIMIT = 0.9;
const LOG_KEY = 'rubiops.tokenLog.v1';
const LEGACY_LOG_KEY = 'smartgenie.tokenLog.v1';
const HISTORY_KEY = 'rubiops.tokenHistory.v1';
const LEGACY_HISTORY_KEY = 'smartgenie.tokenHistory.v1';

const TIER_COST_PER_1K: Record<string, number> = {
  tier1: 0.0004,
  tier2: 0.009,
  tier3: 0.045,
  blocked: 0,
};

interface TokenEntry {
  tokens: number;
  model: string;
  cost: number;
  at: string;
}

interface TokenLog {
  day: string;
  entries: TokenEntry[];
}

interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<unknown>;
}

export interface TokenBudgetSnapshot {
  usedToday: number;
  remaining: number;
  dailyBudget: number;
  nearLimit: boolean;
  exhausted: boolean;
  costToday: number;
  requestsToday: number;
}

export interface OptimizedTokenPrompt extends TokenBudgetSnapshot {
  text: string;
  tokensUsed: number;
  savedTokens: number;
  compressed: boolean;
  downgraded: boolean;
  exhausted: boolean;
  modelTier: string;
}

export interface DayTokenStat {
  date: string;
  used: number;
  saved: number;
  requests: number;
}

const memory = new Map<string, unknown>();
const memoryStore: MementoLike = {
  get<T>(key: string): T | undefined {
    return memory.get(key) as T | undefined;
  },
  update(key: string, value: unknown): Thenable<unknown> {
    memory.set(key, value);
    return Promise.resolve();
  },
};

let store: MementoLike = memoryStore;

export function bindTokenStore(globalState: vscode.Memento): void {
  store = globalState;
}

export function estimateTokens(text: string): number {
  const length = text.trim().length;
  if (length === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(length / 4));
}

export function capText(text: string, maxChars: number): string {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= maxChars) {
    return clean;
  }
  const slice = clean.slice(0, Math.max(0, maxChars));
  const cut = slice.lastIndexOf('\n');
  const kept = (cut > maxChars * 0.6 ? slice.slice(0, cut) : slice).trimEnd();
  return `${kept}\n…`;
}

export function contextCharLimits(nearLimit: boolean): {
  description: number;
  acceptance: number;
  evidence: number;
} {
  if (nearLimit) {
    return { description: 500, acceptance: 280, evidence: 400 };
  }
  return { description: 1600, acceptance: 800, evidence: 900 };
}

export function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function readTokenHistory(days = 7): DayTokenStat[] {
  const stored = store.get<DayTokenStat[]>(HISTORY_KEY) ?? store.get<DayTokenStat[]>(LEGACY_HISTORY_KEY) ?? [];
  const byDate = new Map(stored.map((entry) => [entry.date, entry]));
  const result: DayTokenStat[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = localDateKey(date);
    result.push(byDate.get(key) ?? { date: key, used: 0, saved: 0, requests: 0 });
  }
  return result;
}

export async function recordTokenUse(
  rawText: string,
  sentText: string,
  modelHint = 'agent'
): Promise<OptimizedTokenPrompt> {
  const budget = readTokenBudget();
  const rawTokens = estimateTokens(rawText);
  if (budget.exhausted) {
    return {
      ...budget,
      text: 'Daily token budget is used up. It resets tomorrow.',
      tokensUsed: 0,
      savedTokens: 0,
      compressed: true,
      downgraded: true,
      exhausted: true,
      modelTier: 'blocked',
    };
  }

  let body = sentText.trim();
  let sentTokens = estimateTokens(body);
  let compressed = sentTokens < rawTokens;
  if (sentTokens > budget.remaining) {
    body = capText(body, Math.max(160, budget.remaining * 4));
    sentTokens = Math.min(budget.remaining, estimateTokens(body));
    compressed = true;
  }

  const tier = complexityToTier(classifyComplexity(rawText));
  const savedTokens = Math.max(0, rawTokens - sentTokens);
  const next = await chargeTokens(sentTokens, `${modelHint}:${tier}`, savedTokens);
  return {
    ...next,
    text: body,
    tokensUsed: sentTokens,
    savedTokens,
    compressed,
    downgraded: false,
    exhausted: false,
    modelTier: tier,
  };
}

/** A repeated question answered from local memory. Nothing was sent to the model. */
export async function recordMemoryReuse(avoidedText: string): Promise<OptimizedTokenPrompt> {
  const savedTokens = estimateTokens(avoidedText);
  const next = await chargeTokens(0, 'agent:memory', savedTokens);
  return {
    ...next,
    text: '',
    tokensUsed: 0,
    savedTokens,
    compressed: true,
    downgraded: false,
    exhausted: false,
    modelTier: 'memory',
  };
}

export function readTokenBudget(): TokenBudgetSnapshot {
  const log = loadLog();
  const usedToday = log.entries.reduce((sum, entry) => sum + entry.tokens, 0);
  const costToday = log.entries.reduce((sum, entry) => sum + entry.cost, 0);
  const remaining = Math.max(0, DAILY_TOKEN_BUDGET - usedToday);
  return {
    usedToday,
    remaining,
    dailyBudget: DAILY_TOKEN_BUDGET,
    nearLimit: usedToday >= DAILY_TOKEN_BUDGET * NEAR_LIMIT,
    exhausted: remaining <= 0,
    costToday: Math.round(costToday * 10000) / 10000,
    requestsToday: log.entries.length,
  };
}

export async function applyTokenOptimizer(text: string, modelHint = 'prompt'): Promise<OptimizedTokenPrompt> {
  const budget = readTokenBudget();
  if (budget.exhausted) {
    return {
      ...budget,
      text: 'Daily token budget is used up. It resets tomorrow. Ask a team lead to raise the limit if this blocks delivery.',
      tokensUsed: 0,
      savedTokens: 0,
      compressed: true,
      downgraded: true,
      exhausted: true,
      modelTier: 'blocked',
    };
  }

  const complexity = classifyComplexity(text);
  let tier = complexityToTier(complexity);
  let downgraded = false;
  let compressed = false;
  let body = text.trim();

  if (tier === 'tier3' && budget.nearLimit) {
    tier = 'tier2';
    downgraded = true;
    const shrunk = capText(body, 1800);
    compressed = shrunk.length < body.length;
    body = shrunk;
  } else if (estimateTokens(body) > 2500) {
    const shrunk = capText(body, 6000);
    compressed = shrunk.length < body.length;
    body = shrunk;
  }

  let note = downgraded
    ? '[Token optimizer: downgraded this request from a large-context pass because today\'s budget is nearly used.]'
    : compressed
      ? '[Token optimizer: trimmed long description, acceptance criteria, and code context so this request stays inside the daily token budget.]'
      : '';

  if (estimateTokens(note ? `${body}\n\n${note}` : body) > budget.remaining) {
    const maxChars = Math.max(160, budget.remaining * 4 - 80);
    body = capText(body, maxChars);
    compressed = true;
    if (!note) {
      note =
        '[Token optimizer: trimmed long description, acceptance criteria, and code context so this request stays inside the daily token budget.]';
    }
  }

  const finalText = note ? `${body}\n\n${note}` : body;
  const tokensUsed = Math.min(budget.remaining, estimateTokens(finalText));
  const savedTokens = Math.max(0, estimateTokens(text) - tokensUsed);
  const next = await chargeTokens(tokensUsed, `${modelHint}:${tier}`, savedTokens);
  return {
    ...next,
    text: finalText,
    tokensUsed,
    savedTokens,
    compressed,
    downgraded,
    exhausted: false,
    modelTier: tier,
  };
}

function classifyComplexity(prompt: string): number {
  const lower = prompt.toLowerCase();
  if (['rename', 'typo', 'comment', 'format', 'indent'].some((word) => lower.includes(word))) {
    return 1;
  }
  let score = 3;
  if (['fix', 'bug', 'error', 'import', 'variable'].some((word) => lower.includes(word))) {
    score = 3;
  }
  if (['function', 'class', 'method', 'test', 'api'].some((word) => lower.includes(word))) {
    score = Math.max(score, 5);
  }
  if (['refactor', 'debug', 'optimise', 'optimize'].some((word) => lower.includes(word))) {
    score = Math.max(score, 6);
  }
  if (['architecture', 'design', 'system', 'security', 'audit'].some((word) => lower.includes(word))) {
    score = Math.max(score, 8);
  }
  if (['entire', 'all files', 'migrate', 'rewrite'].some((word) => lower.includes(word))) {
    score = Math.max(score, 9);
  }
  if (prompt.length > 500) {
    score = Math.max(score, 6);
  }
  if (prompt.length > 1000) {
    score = Math.max(score, 8);
  }
  return Math.min(score, 10);
}

function complexityToTier(complexity: number): string {
  if (complexity <= 3) {
    return 'tier1';
  }
  if (complexity <= 7) {
    return 'tier2';
  }
  return 'tier3';
}

async function chargeTokens(tokens: number, model: string, saved = 0): Promise<TokenBudgetSnapshot> {
  const log = loadLog();
  const tier = model.split(':').pop() ?? 'tier2';
  const cost = (tokens / 1000) * (TIER_COST_PER_1K[tier] ?? TIER_COST_PER_1K.tier2);
  log.entries.push({
    tokens,
    model,
    cost,
    at: new Date().toISOString(),
  });
  if (log.entries.length > 400) {
    log.entries = log.entries.slice(-400);
  }
  await store.update(LOG_KEY, log);
  await bumpHistory(tokens, saved);
  return readTokenBudget();
}

async function bumpHistory(used: number, saved: number): Promise<void> {
  const key = localDateKey();
  const days = [...(store.get<DayTokenStat[]>(HISTORY_KEY) ?? store.get<DayTokenStat[]>(LEGACY_HISTORY_KEY) ?? [])];
  const existing = days.find((entry) => entry.date === key);
  if (existing) {
    existing.used += used;
    existing.saved += saved;
    existing.requests += 1;
  } else {
    days.push({ date: key, used, saved, requests: 1 });
  }
  days.sort((left, right) => left.date.localeCompare(right.date));
  await store.update(HISTORY_KEY, days.slice(-30));
}

function loadLog(): TokenLog {
  const today = new Date().toISOString().slice(0, 10);
  const stored = store.get<TokenLog>(LOG_KEY) ?? store.get<TokenLog>(LEGACY_LOG_KEY);
  if (stored?.day === today && Array.isArray(stored.entries)) {
    return stored;
  }
  return { day: today, entries: [] };
}
