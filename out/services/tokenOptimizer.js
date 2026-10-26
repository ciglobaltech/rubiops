"use strict";
/**
 * Token optimizer from the old Jessie agent.
 * Each user has a 100,000 token daily budget. Usage is logged, prompts are
 * compressed when they get long, and a large request is downgraded once
 * today's usage passes 90% of the budget.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEAR_LIMIT = exports.DAILY_TOKEN_BUDGET = void 0;
exports.bindTokenStore = bindTokenStore;
exports.estimateTokens = estimateTokens;
exports.capText = capText;
exports.contextCharLimits = contextCharLimits;
exports.localDateKey = localDateKey;
exports.readTokenHistory = readTokenHistory;
exports.recordTokenUse = recordTokenUse;
exports.recordMemoryReuse = recordMemoryReuse;
exports.readTokenBudget = readTokenBudget;
exports.applyTokenOptimizer = applyTokenOptimizer;
exports.DAILY_TOKEN_BUDGET = 100_000;
exports.NEAR_LIMIT = 0.9;
const LOG_KEY = 'rubiops.tokenLog.v1';
const LEGACY_LOG_KEY = 'smartgenie.tokenLog.v1';
const HISTORY_KEY = 'rubiops.tokenHistory.v1';
const LEGACY_HISTORY_KEY = 'smartgenie.tokenHistory.v1';
const TIER_COST_PER_1K = {
    tier1: 0.0004,
    tier2: 0.009,
    tier3: 0.045,
    blocked: 0,
};
const memory = new Map();
const memoryStore = {
    get(key) {
        return memory.get(key);
    },
    update(key, value) {
        memory.set(key, value);
        return Promise.resolve();
    },
};
let store = memoryStore;
function bindTokenStore(globalState) {
    store = globalState;
}
function estimateTokens(text) {
    const length = text.trim().length;
    if (length === 0) {
        return 0;
    }
    return Math.max(1, Math.ceil(length / 4));
}
function capText(text, maxChars) {
    const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (clean.length <= maxChars) {
        return clean;
    }
    const slice = clean.slice(0, Math.max(0, maxChars));
    const cut = slice.lastIndexOf('\n');
    const kept = (cut > maxChars * 0.6 ? slice.slice(0, cut) : slice).trimEnd();
    return `${kept}\n…`;
}
function contextCharLimits(nearLimit) {
    if (nearLimit) {
        return { description: 500, acceptance: 280, evidence: 400 };
    }
    return { description: 1600, acceptance: 800, evidence: 900 };
}
function localDateKey(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}
function readTokenHistory(days = 7) {
    const stored = store.get(HISTORY_KEY) ?? store.get(LEGACY_HISTORY_KEY) ?? [];
    const byDate = new Map(stored.map((entry) => [entry.date, entry]));
    const result = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        const key = localDateKey(date);
        result.push(byDate.get(key) ?? { date: key, used: 0, saved: 0, requests: 0 });
    }
    return result;
}
async function recordTokenUse(rawText, sentText, modelHint = 'agent') {
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
async function recordMemoryReuse(avoidedText) {
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
function readTokenBudget() {
    const log = loadLog();
    const usedToday = log.entries.reduce((sum, entry) => sum + entry.tokens, 0);
    const costToday = log.entries.reduce((sum, entry) => sum + entry.cost, 0);
    const remaining = Math.max(0, exports.DAILY_TOKEN_BUDGET - usedToday);
    return {
        usedToday,
        remaining,
        dailyBudget: exports.DAILY_TOKEN_BUDGET,
        nearLimit: usedToday >= exports.DAILY_TOKEN_BUDGET * exports.NEAR_LIMIT,
        exhausted: remaining <= 0,
        costToday: Math.round(costToday * 10000) / 10000,
        requestsToday: log.entries.length,
    };
}
async function applyTokenOptimizer(text, modelHint = 'prompt') {
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
    }
    else if (estimateTokens(body) > 2500) {
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
function classifyComplexity(prompt) {
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
function complexityToTier(complexity) {
    if (complexity <= 3) {
        return 'tier1';
    }
    if (complexity <= 7) {
        return 'tier2';
    }
    return 'tier3';
}
async function chargeTokens(tokens, model, saved = 0) {
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
async function bumpHistory(used, saved) {
    const key = localDateKey();
    const days = [...(store.get(HISTORY_KEY) ?? store.get(LEGACY_HISTORY_KEY) ?? [])];
    const existing = days.find((entry) => entry.date === key);
    if (existing) {
        existing.used += used;
        existing.saved += saved;
        existing.requests += 1;
    }
    else {
        days.push({ date: key, used, saved, requests: 1 });
    }
    days.sort((left, right) => left.date.localeCompare(right.date));
    await store.update(HISTORY_KEY, days.slice(-30));
}
function loadLog() {
    const today = new Date().toISOString().slice(0, 10);
    const stored = store.get(LOG_KEY) ?? store.get(LEGACY_LOG_KEY);
    if (stored?.day === today && Array.isArray(stored.entries)) {
        return stored;
    }
    return { day: today, entries: [] };
}
//# sourceMappingURL=tokenOptimizer.js.map