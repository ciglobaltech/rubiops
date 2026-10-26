"use strict";
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
exports.buildWorkspaceCodeSummary = buildWorkspaceCodeSummary;
exports.buildTaskImplementationPrompt = buildTaskImplementationPrompt;
exports.buildAutoFixPrompt = buildAutoFixPrompt;
const vscode = __importStar(require("vscode"));
const gitWorkItem_1 = require("../utils/gitWorkItem");
const tokenOptimizer_1 = require("./tokenOptimizer");
async function buildWorkspaceCodeSummary(folder) {
    if (!folder) {
        return 'No workspace folder is open. Open the project repository folder in VS Code/Cursor.';
    }
    try {
        const entries = await vscode.workspace.fs.readDirectory(folder.uri);
        const topLevel = entries
            .slice(0, 40)
            .map(([name, type]) => (type === vscode.FileType.Directory ? `${name}/` : name))
            .join(', ');
        const hints = [];
        const names = new Set(entries.map(([name]) => name.toLowerCase()));
        if (names.has('package.json'))
            hints.push('Node.js / npm project');
        if (names.has('tsconfig.json'))
            hints.push('TypeScript');
        if (names.has('pyproject.toml') || names.has('requirements.txt'))
            hints.push('Python');
        if (names.has('cargo.toml'))
            hints.push('Rust');
        if (names.has('go.mod'))
            hints.push('Go');
        if (names.has('pom.xml') || names.has('build.gradle'))
            hints.push('Java');
        if (names.has('.sln') || names.has('*.csproj'))
            hints.push('.NET');
        if (names.has('dockerfile') || names.has('docker-compose.yml'))
            hints.push('Docker');
        const stack = hints.length > 0 ? hints.join(', ') : 'Inspect package manifests in the repo root';
        return [
            `Workspace folder: ${folder.uri.fsPath}`,
            `Detected stack hints: ${stack}`,
            `Top-level entries: ${topLevel || '(empty)'}`,
        ].join('\n');
    }
    catch {
        return `Workspace folder: ${folder.uri.fsPath}`;
    }
}
async function buildTaskImplementationPrompt(ctx, options) {
    const { workItem } = ctx;
    const folder = vscode.workspace.workspaceFolders?.[0];
    const codeSummary = await buildWorkspaceCodeSummary(folder);
    const limits = (0, tokenOptimizer_1.contextCharLimits)((0, tokenOptimizer_1.readTokenBudget)().nearLimit);
    const description = (0, tokenOptimizer_1.capText)(stripHtml(workItem.description), limits.description);
    const acceptance = (0, tokenOptimizer_1.capText)(stripHtml(workItem.acceptanceCriteria ?? ''), limits.acceptance);
    const branchSuggestion = slugifyBranch(workItem.id, workItem.title);
    const commitMessage = (0, gitWorkItem_1.formatCommitMessage)(workItem.id, workItem.title);
    const sections = [
        'You are an AI coding agent helping implement an Azure DevOps work item using the open workspace codebase.',
        '',
        '## Workspace & repository',
        codeSummary,
        ctx.workspaceLabel ? `Workspace label: ${ctx.workspaceLabel}` : '',
        ctx.orgUrl ? `Azure DevOps org: ${ctx.orgUrl}` : '',
        ctx.projectName ? `ADO project: ${ctx.projectName}` : '',
        '',
        '## Work item',
        `- ID: #${workItem.id}`,
        `- Title: ${workItem.title}`,
        `- Type: ${workItem.workItemType}`,
        `- State: ${workItem.state}`,
        `- Priority: ${workItem.priority}`,
        `- Area: ${workItem.areaPath || 'N/A'}`,
        `- Iteration: ${workItem.iterationPath || 'N/A'}`,
        workItem.assignedTo ? `- Assigned to: ${workItem.assignedTo}` : '',
        workItem.tags.length > 0 ? `- Tags: ${workItem.tags.join(', ')}` : '',
        workItem.parentId
            ? `- Parent: #${workItem.parentId}${workItem.parentTitle ? ` — ${workItem.parentTitle}` : ''}`
            : '',
        ctx.webUrl ? `- Link: ${ctx.webUrl}` : '',
        '',
        '## Description',
        description || '(No description provided in Azure DevOps)',
        '',
        '## Acceptance criteria',
        acceptance || '(No acceptance criteria field provided — derive criteria from the description and title)',
        '',
        '## Git helpers',
        `- Suggested branch: \`${branchSuggestion}\``,
        `- Suggested commit message: \`${commitMessage}\``,
        '',
        '## Your task',
        '1. Explore the workspace code that is most relevant to this work item.',
        '2. Summarize the implementation approach in 3–6 bullets.',
        '3. Implement the changes following existing conventions, patterns, and folder structure.',
        '4. Call out risks, missing requirements, or tests that should be added.',
        '5. Do not invent requirements that contradict the description or acceptance criteria.',
        '',
        'Start by listing the files you will inspect, then proceed with the implementation.',
    ];
    const prompt = sections.filter((line) => line !== undefined).join('\n').trim();
    if (options?.charge === false) {
        return prompt;
    }
    return finalizePrompt(prompt, 'work-item');
}
async function buildAutoFixPrompt(ctx) {
    const base = await buildTaskImplementationPrompt(ctx, { charge: false });
    const limits = (0, tokenOptimizer_1.contextCharLimits)((0, tokenOptimizer_1.readTokenBudget)().nearLimit);
    const evidence = ctx.evidence ? (0, tokenOptimizer_1.capText)(ctx.evidence, limits.evidence) : '';
    const extras = [
        '',
        '## Auto Code Fix mode (unattended)',
        'You are running headlessly via Cursor SDK. RubiOps will commit, push, and open an Azure DevOps PR after you finish.',
        'Rules:',
        '1. Implement the smallest correct fix for this work item in the open workspace.',
        '2. Follow existing project conventions and folder structure.',
        '3. Do NOT run git commit, git push, or create a PR yourself.',
        '4. Leave all code changes unstaged/dirty so RubiOps can commit them.',
        '5. Do not invent requirements that contradict Description / Expected Result / Acceptance Criteria.',
        '6. When done, briefly summarize files changed and how the bug is fixed.',
        evidence ? '' : '',
        evidence ? '## Broken verify / test evidence' : '',
        evidence ? evidence : '',
    ]
        .filter((line) => line !== undefined)
        .join('\n');
    return finalizePrompt(`${base}\n${extras}`.trim(), 'auto-fix');
}
async function finalizePrompt(prompt, modelHint) {
    const fitted = await (0, tokenOptimizer_1.applyTokenOptimizer)(prompt, modelHint);
    if (fitted.exhausted) {
        throw new Error(fitted.text);
    }
    return fitted.text;
}
function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function slugifyBranch(id, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
    return `feature/${id}-${slug || 'task'}`;
}
//# sourceMappingURL=aiPromptService.js.map