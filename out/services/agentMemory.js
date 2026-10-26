"use strict";
/**
 * Local memory from the old Jessie store.
 * Session, then project, then user. A repeated question is answered from
 * here. The AI is called only when that memory is missing or the workspace
 * files behind it have changed.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindAgentMemory = bindAgentMemory;
exports.questionTopic = questionTopic;
exports.lookupMemory = lookupMemory;
exports.stampFiles = stampFiles;
exports.signatureOf = signatureOf;
exports.changedFieldText = changedFieldText;
exports.rememberAnswer = rememberAnswer;
const crypto = __importStar(require("crypto"));
const vscode = __importStar(require("vscode"));
const workspace_1 = require("../utils/workspace");
const STORE_KEY = 'rubiops.memory.v1';
const LEGACY_STORE_KEY = 'smartgenie.memory.v1';
const FILLER = new Set([
    'the', 'for', 'name', 'file', 'files', 'send', 'sent', 'what', 'where', 'this', 'that',
    'with', 'from', 'and', 'please', 'show', 'tell', 'give', 'function', 'sent',
]);
let rows = new Map();
let persist;
function bindAgentMemory(globalState) {
    const stored = globalState.get(STORE_KEY) ?? globalState.get(LEGACY_STORE_KEY) ?? {};
    rows = new Map(Object.entries(stored));
    persist = (value) => globalState.update(STORE_KEY, value);
}
function questionTopic(query, intent) {
    const words = [...new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((word) => !FILLER.has(word)))].sort();
    return `${intent}:${words.join('-') || 'general'}`;
}
function lookupMemory(input) {
    const found = read(`session:${input.sessionId}:${input.topic}`) ??
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
async function stampFiles(relativePaths) {
    const folder = (0, workspace_1.getActiveWorkspaceFolder)();
    if (!folder) {
        return [];
    }
    const stamps = [];
    for (const relative of relativePaths.slice(0, 6)) {
        try {
            const uri = vscode.Uri.joinPath(folder.uri, ...relative.split(/[\\/]/).filter(Boolean));
            const bytes = await vscode.workspace.fs.readFile(uri);
            const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
            const text = Buffer.from(bytes).toString('utf8').slice(0, 80_000);
            stamps.push({ path: relative, hash, fields: fieldLines(text) });
        }
        catch {
            stamps.push({ path: relative, hash: 'missing', fields: [] });
        }
    }
    return stamps;
}
function signatureOf(stamps) {
    return stamps.map((stamp) => `${stamp.path}@${stamp.hash}`).join('|');
}
async function changedFieldText(previous) {
    if (!previous?.length) {
        return '';
    }
    const current = await stampFiles(previous.map((stamp) => stamp.path));
    const blocks = [];
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
async function rememberAnswer(input) {
    const stamped = { value: input.value, updatedAt: new Date().toISOString() };
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
function read(key) {
    return rows.get(key)?.value;
}
async function save() {
    if (rows.size > 300) {
        const oldest = [...rows.entries()].sort((left, right) => left[1].updatedAt.localeCompare(right[1].updatedAt));
        for (const [key] of oldest.slice(0, rows.size - 300)) {
            rows.delete(key);
        }
    }
    const payload = {};
    for (const [key, row] of rows) {
        payload[key] = row;
    }
    await persist?.(payload);
}
function workspaceId() {
    return (0, workspace_1.getWorkspaceKey)();
}
function fieldLines(text) {
    const lines = [];
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
function lineDiff(before, after) {
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
//# sourceMappingURL=agentMemory.js.map