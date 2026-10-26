/**
 * Local memory from the old Jessie store.
 * Session, then project, then user. A repeated question is answered from
 * here. The AI is called only when that memory is missing or the workspace
 * files behind it have changed.
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { getActiveWorkspaceFolder, getWorkspaceKey } from '../utils/workspace';

export interface FileStamp {
  path: string;
  hash: string;
  fields: string[];
}

export interface MemoryValue {
  answer: string;
  question: string;
  signature: string;
  source: string;
  stamps?: FileStamp[];
}

export type MemoryLookup =
  | { kind: 'fresh'; value: MemoryValue }
  | { kind: 'stale'; value: MemoryValue }
  | { kind: 'miss' };

interface MemoryRow {
  value: MemoryValue;
  updatedAt: string;
}

const STORE_KEY = 'rubiops.memory.v1';
const LEGACY_STORE_KEY = 'smartgenie.memory.v1';
const FILLER = new Set([
  'the', 'for', 'name', 'file', 'files', 'send', 'sent', 'what', 'where', 'this', 'that',
  'with', 'from', 'and', 'please', 'show', 'tell', 'give', 'function', 'sent',
]);

let rows = new Map<string, MemoryRow>();
let persist: ((value: Record<string, MemoryRow>) => Thenable<unknown>) | undefined;

export function bindAgentMemory(globalState: vscode.Memento): void {
  const stored = globalState.get<Record<string, MemoryRow>>(STORE_KEY) ?? globalState.get<Record<string, MemoryRow>>(LEGACY_STORE_KEY) ?? {};
  rows = new Map(Object.entries(stored));
  persist = (value) => globalState.update(STORE_KEY, value);
}

export function questionTopic(query: string, intent: string): string {
  const words = [...new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((word) => !FILLER.has(word)))].sort();
  return `${intent}:${words.join('-') || 'general'}`;
}

export function lookupMemory(input: {
  sessionId: string;
  topic: string;
  signature: string;
}): MemoryLookup {
  const found =
    read(`session:${input.sessionId}:${input.topic}`) ??
    read(`project:${workspaceId()}:${input.topic}`) ??
    read(`user:local:${input.topic}`);
  if (!found) {
    return { kind: 'miss' };
  }
  if (found.signature === input.signature) {
    return { kind: 'fresh', value: found };
  }
  return { kind: 'stale', value: found };
}

export async function stampFiles(relativePaths: string[]): Promise<FileStamp[]> {
  const folder = getActiveWorkspaceFolder();
  if (!folder) {
    return [];
  }
  const stamps: FileStamp[] = [];
  for (const relative of relativePaths.slice(0, 6)) {
    try {
      const uri = vscode.Uri.joinPath(folder.uri, ...relative.split(/[\\/]/).filter(Boolean));
      const bytes = await vscode.workspace.fs.readFile(uri);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
      const text = Buffer.from(bytes).toString('utf8').slice(0, 80_000);
      stamps.push({ path: relative, hash, fields: fieldLines(text) });
    } catch {
      stamps.push({ path: relative, hash: 'missing', fields: [] });
    }
  }
  return stamps;
}

export function signatureOf(stamps: FileStamp[]): string {
  return stamps.map((stamp) => `${stamp.path}@${stamp.hash}`).join('|');
}

export async function changedFieldText(previous: FileStamp[] | undefined): Promise<string> {
  if (!previous?.length) {
    return '';
  }
  const current = await stampFiles(previous.map((stamp) => stamp.path));
  const blocks: string[] = [];
  for (const before of previous) {
    const after = current.find((stamp) => stamp.path === before.path);
    if (!after || after.hash === 'missing') {
      blocks.push(`${before.path}: file removed`);
      continue;
    }
    if (after.hash === before.hash) {
      continue;
    }
    const diff = lineDiff(before.fields ?? [], after.fields);
    blocks.push(diff ? `${before.path}:\n${diff}` : `${before.path}: contents changed`);
  }
  return blocks.join('\n').slice(0, 1400);
}

export async function rememberAnswer(input: {
  sessionId: string;
  topic: string;
  value: MemoryValue;
}): Promise<void> {
  const stamped: MemoryRow = { value: input.value, updatedAt: new Date().toISOString() };
  rows.set(`session:${input.sessionId}:${input.topic}`, stamped);
  rows.set(`project:${workspaceId()}:${input.topic}`, stamped);
  rows.set(`user:local:${input.topic}`, stamped);
  rows.set(`project:${workspaceId()}:sentinel:baseline`, {
    value: {
      answer: input.value.signature,
      question: 'sentinel',
      signature: input.value.signature,
      source: 'sentinel',
    },
    updatedAt: stamped.updatedAt,
  });
  await save();
}

function read(key: string): MemoryValue | undefined {
  return rows.get(key)?.value;
}

async function save(): Promise<void> {
  if (rows.size > 300) {
    const oldest = [...rows.entries()].sort((left, right) => left[1].updatedAt.localeCompare(right[1].updatedAt));
    for (const [key] of oldest.slice(0, rows.size - 300)) {
      rows.delete(key);
    }
  }
  const payload: Record<string, MemoryRow> = {};
  for (const [key, row] of rows) {
    payload[key] = row;
  }
  await persist?.(payload);
}

function workspaceId(): string {
  return getWorkspaceKey();
}

function fieldLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('import ') || line.startsWith('using ')) {
      continue;
    }
    if (/[=:]/.test(line) || /\b(class|function|def|struct|enum|interface)\b/.test(line)) {
      lines.push(line.slice(0, 140));
    }
    if (lines.length >= 60) {
      break;
    }
  }
  return lines;
}

function lineDiff(before: string[], after: string[]): string {
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const removed = before.filter((line) => !afterSet.has(line)).slice(0, 12);
  const added = after.filter((line) => !beforeSet.has(line)).slice(0, 12);
  return [
    removed.length ? `Removed:\n${removed.join('\n')}` : '',
    added.length ? `Changed:\n${added.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
