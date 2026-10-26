"use strict";
/**
 * LangChain-style chain that runs before the developer's own AI.
 * It does not call a second model. It classifies the query, keeps a short
 * memory instead of the full chat, and attaches only a small slice of the
 * open file. The shorter prompt is what gets sent, and the difference is
 * recorded as tokens saved.
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
exports.understandQuery = understandQuery;
exports.runAgentChain = runAgentChain;
const vscode = __importStar(require("vscode"));
const agentPlatform_1 = require("./agentPlatform");
const agentMemory_1 = require("./agentMemory");
const tokenOptimizer_1 = require("./tokenOptimizer");
const taskRunner_1 = require("./taskRunner");
const INTENT_RULES = [
    {
        intent: 'standup',
        label: 'Standup',
        pattern: /\b(standup|stand-up|yesterday|what did i do|status update|blockers?)\b/i,
        instruction: 'Write a short standup: yesterday, today, blockers. No preamble.',
    },
    {
        intent: 'search',
        label: 'Work item lookup',
        pattern: /\b(find|search|work item|ticket|bug|task|backlog|assigned|sprint)\b/i,
        instruction: 'Answer the lookup. Do not invent work item ids or paste unrelated code.',
    },
    {
        intent: 'explain',
        label: 'Explain code',
        pattern: /\b(explain|what does|how does|why does|walk me through)\b/i,
        instruction: 'Explain in a short answer. Do not rewrite the file.',
    },
    {
        intent: 'code',
        label: 'Code change',
        pattern: /\b(fix|implement|refactor|add|change|error|function|class|test|bug)\b/i,
        instruction: 'Change only the code this asks for. Return the edit, not the whole file.',
    },
];
function understandQuery(query) {
    if ((0, taskRunner_1.isRunnableTask)(query)) {
        return {
            intent: 'task',
            label: 'Run task',
            instruction: 'Run the task in the project. Do not only describe the steps.',
        };
    }
    if (isFileLookup(query)) {
        return {
            intent: 'lookup',
            label: 'File lookup',
            instruction: 'The user wants a file name from this workspace. Answer with the file name and path from Workspace files only. One or two sentences. Do not invent a file. Do not return code.',
        };
    }
    const match = INTENT_RULES.find((rule) => rule.pattern.test(query));
    if (match) {
        return { intent: match.intent, label: match.label, instruction: match.instruction };
    }
    return {
        intent: 'general',
        label: 'General question',
        instruction: 'Answer directly in plain language. Skip preamble and do not repeat the question. Do not return a code edit unless the user asked to change code.',
    };
}
function isFileLookup(query) {
    return (/\b(file\s*names?|filenames?|name of|which file|what file|where is the file)\b/i.test(query) ||
        /\b(send|sent|show|tell|give)\s+me\s+the\s+name\b/i.test(query));
}
async function runAgentChain(query, history, platform, secrets, sessionId, onDelta) {
    const understood = understandQuery(query);
    if (understood.intent === 'task') {
        const reply = await (0, taskRunner_1.executeTask)(query);
        onDelta?.(reply);
        return {
            intentLabel: understood.label,
            optimizedPrompt: '',
            rawTokens: 0,
            sentTokens: 0,
            savedTokens: 0,
            agentLabel: platform.label,
            opened: false,
            exhausted: false,
            reply,
        };
    }
    const editor = readEditorContext(understood.intent);
    const memory = compressMemory(history);
    const question = collapse(query);
    const files = understood.intent === 'standup' ? [] : await findMatchingFiles(query);
    const fileList = files.length ? files.map((file) => `- ${file}`).join('\n') : 'none';
    const rawPrompt = [
        'You are a coding assistant. Use the full conversation and the full open file.',
        memory.raw ? `Conversation:\n${memory.raw}` : '',
        editor.raw ? `Open file:\n${editor.raw}` : '',
        understood.intent === 'lookup' ? `Workspace files:\n${fileList}` : '',
        `User: ${query.trim()}`,
    ]
        .filter(Boolean)
        .join('\n\n');
    const optimizedPrompt = [
        understood.instruction,
        memory.lean,
        editor.lean,
        understood.intent === 'lookup' ? `Workspace files:\n${fileList}` : '',
        `Question: ${question}`,
    ]
        .filter(Boolean)
        .join('\n');
    const topic = (0, agentMemory_1.questionTopic)(query, understood.intent);
    const stamps = await (0, agentMemory_1.stampFiles)(files);
    const signature = (0, agentMemory_1.signatureOf)(stamps);
    const hit = (0, agentMemory_1.lookupMemory)({ sessionId, topic, signature });
    if (hit.kind === 'fresh') {
        const recorded = await (0, tokenOptimizer_1.recordMemoryReuse)(rawPrompt);
        const reply = `${hit.value.answer}\n\nFrom local memory · the code is unchanged · saved ${recorded.savedTokens.toLocaleString()} tokens · ${platform.label} was not called`;
        onDelta?.(reply);
        return {
            intentLabel: understood.label,
            optimizedPrompt: '',
            rawTokens: (0, tokenOptimizer_1.estimateTokens)(rawPrompt),
            sentTokens: 0,
            savedTokens: recorded.savedTokens,
            agentLabel: platform.label,
            opened: false,
            exhausted: false,
            reply,
        };
    }
    if (hit.kind === 'stale') {
        const diff = await (0, agentMemory_1.changedFieldText)(hit.value.stamps);
        const redefinePrompt = [
            'Previous answer:',
            hit.value.answer.slice(0, 600),
            'These fields changed in the code since that answer:',
            diff || 'The file contents changed.',
            'Redefine only the parts of the answer those changes affect. Keep facts that did not change. Do not repeat the whole file.',
            `Question: ${question}`,
        ].join('\n');
        const recorded = await (0, tokenOptimizer_1.recordTokenUse)(rawPrompt, redefinePrompt, 'agent:redefine');
        if (recorded.exhausted) {
            return {
                intentLabel: understood.label,
                optimizedPrompt: recorded.text,
                rawTokens: (0, tokenOptimizer_1.estimateTokens)(rawPrompt),
                sentTokens: 0,
                savedTokens: 0,
                agentLabel: platform.label,
                opened: false,
                exhausted: true,
                reply: recorded.text,
            };
        }
        const modelAnswer = await (0, agentPlatform_1.askAgentPlatform)(platform, recorded.text, secrets, onDelta);
        const answer = modelAnswer.trim() || hit.value.answer;
        await (0, agentMemory_1.rememberAnswer)({
            sessionId,
            topic,
            value: { answer, question: query.trim(), signature, source: platform.label, stamps },
        });
        const reply = `${answer}\n\nRedefined from the changed fields · sent ${recorded.tokensUsed.toLocaleString()} tokens · saved ${recorded.savedTokens.toLocaleString()}`;
        return {
            intentLabel: understood.label,
            optimizedPrompt: recorded.text,
            rawTokens: (0, tokenOptimizer_1.estimateTokens)(rawPrompt),
            sentTokens: recorded.tokensUsed,
            savedTokens: recorded.savedTokens,
            agentLabel: platform.label,
            opened: false,
            exhausted: false,
            reply,
        };
    }
    const recorded = await (0, tokenOptimizer_1.recordTokenUse)(rawPrompt, optimizedPrompt, `agent:${understood.intent}`);
    if (recorded.exhausted) {
        return {
            intentLabel: understood.label,
            optimizedPrompt: recorded.text,
            rawTokens: (0, tokenOptimizer_1.estimateTokens)(rawPrompt),
            sentTokens: 0,
            savedTokens: 0,
            agentLabel: platform.label,
            opened: false,
            exhausted: true,
            reply: recorded.text,
        };
    }
    const modelAnswer = await (0, agentPlatform_1.askAgentPlatform)(platform, recorded.text, secrets, onDelta);
    const answer = groundLookupAnswer(understood.intent, files, modelAnswer);
    await (0, agentMemory_1.rememberAnswer)({
        sessionId,
        topic,
        value: {
            answer,
            question: query.trim(),
            signature,
            source: platform.label,
            stamps,
        },
    });
    const savedLabel = recorded.savedTokens.toLocaleString();
    return {
        intentLabel: understood.label,
        optimizedPrompt: recorded.text,
        rawTokens: (0, tokenOptimizer_1.estimateTokens)(rawPrompt),
        sentTokens: recorded.tokensUsed,
        savedTokens: recorded.savedTokens,
        agentLabel: platform.label,
        opened: false,
        exhausted: false,
        reply: `${answer}\n\nUpdated from ${platform.label} and saved to local memory · saved ${savedLabel} tokens`,
    };
}
function compressMemory(history) {
    if (history.length === 0) {
        return { raw: '', lean: '' };
    }
    const raw = history.map((turn, index) => `${index + 1}. ${turn.query}`).join('\n');
    const recent = history.slice(-2).map((turn) => collapse(turn.query).slice(0, 140));
    const omitted = Math.max(0, history.length - recent.length);
    const lean = [
        omitted > 0 ? `Earlier questions omitted: ${omitted}.` : '',
        recent.length > 0 ? `Recent: ${recent.join(' | ')}` : '',
    ]
        .filter(Boolean)
        .join(' ');
    return { raw, lean };
}
function groundLookupAnswer(intent, files, modelAnswer) {
    if (intent !== 'lookup') {
        return modelAnswer;
    }
    if (files.length === 0) {
        return 'No file in this workspace matches that name.';
    }
    const cited = files.filter((file) => {
        const base = file.split(/[\\/]/).pop()?.toLowerCase() ?? '';
        return modelAnswer.toLowerCase().includes(base);
    });
    if (cited.length > 0) {
        return modelAnswer;
    }
    if (files.length === 1) {
        return `The file is ${files[0]}.`;
    }
    return `Matching files:\n${files.join('\n')}`;
}
const LOOKUP_STOP_WORDS = new Set([
    'the', 'for', 'name', 'file', 'files', 'send', 'sent', 'what', 'where', 'this', 'that',
    'with', 'from', 'and', 'please', 'show', 'tell', 'give',
]);
async function findMatchingFiles(query) {
    const keywords = [...new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((word) => !LOOKUP_STOP_WORDS.has(word)))].slice(0, 4);
    if (keywords.length === 0) {
        return [];
    }
    const ignore = '**/{node_modules,.git,dist,out,build,.next}/**';
    const patterns = keywords.map((word) => `**/*${word}*`);
    if (keywords.length >= 2) {
        patterns.unshift(`**/*${keywords[0]}*${keywords[1]}*`);
    }
    const scores = new Map();
    for (const pattern of patterns) {
        const uris = await vscode.workspace.findFiles(pattern, ignore, 40);
        for (const uri of uris) {
            const relative = vscode.workspace.asRelativePath(uri);
            const base = relative.split(/[\\/]/).pop()?.toLowerCase() ?? '';
            let score = scores.get(relative) ?? 0;
            for (const word of keywords) {
                if (base.includes(word)) {
                    score += 3;
                }
                else if (relative.toLowerCase().includes(word)) {
                    score += 1;
                }
            }
            if (keywords.every((word) => base.includes(word))) {
                score += 10;
            }
            scores.set(relative, score);
        }
    }
    return [...scores.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 8)
        .map(([file]) => file);
}
function readEditorContext(intent) {
    if (intent === 'standup' || intent === 'search' || intent === 'lookup') {
        return { raw: '', lean: '' };
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { raw: '', lean: '' };
    }
    const document = editor.document;
    const selected = document.getText(editor.selection).trim();
    const fileName = document.fileName.split(/[\\/]/).pop() ?? 'file';
    const rawBody = selected || document.getText().slice(0, 20_000);
    const raw = `${fileName}\n${rawBody}`;
    const leanBody = selected
        ? collapse(selected).slice(0, 500)
        : linesAroundCursor(editor);
    if (!leanBody) {
        return { raw, lean: '' };
    }
    return { raw, lean: `Context (${fileName}): ${leanBody}` };
}
function linesAroundCursor(editor) {
    const line = editor.selection.active.line;
    const start = Math.max(0, line - 6);
    const end = Math.min(editor.document.lineCount - 1, line + 6);
    const snippet = editor.document.getText(new vscode.Range(start, 0, end, 10_000));
    return collapse(snippet).slice(0, 500);
}
function collapse(value) {
    return value.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}
//# sourceMappingURL=agentChain.js.map