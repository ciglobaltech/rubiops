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
exports.AutoCodeFixService = void 0;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../utils/constants");
const workspace_1 = require("../utils/workspace");
const gitWorkItem_1 = require("../utils/gitWorkItem");
const aiPromptService_1 = require("./aiPromptService");
const descriptionBlocks_1 = require("../utils/descriptionBlocks");
/**
 * Unattended: Cursor SDK local agent → commit → push → Azure DevOps PR.
 */
class AutoCodeFixService {
    secrets;
    authService;
    workItemService;
    git;
    notifications;
    output;
    progressPanel;
    running = false;
    constructor(secrets, authService, workItemService, git, notifications, output, progressPanel) {
        this.secrets = secrets;
        this.authService = authService;
        this.workItemService = workItemService;
        this.git = git;
        this.notifications = notifications;
        this.output = output;
        this.progressPanel = progressPanel;
    }
    async promptAndStoreCursorApiKey() {
        const existing = await this.secrets.get(constants_1.SECRET_KEYS.CURSOR_API_KEY);
        const value = await vscode.window.showInputBox({
            title: 'Cursor API Key for Auto Code Fix',
            prompt: 'Paste your Cursor API key (stored in VS Code Secret Storage).',
            password: true,
            ignoreFocusOut: true,
            value: existing ? '********' : undefined,
            placeHolder: 'cursor_…',
        });
        if (value === undefined) {
            return false;
        }
        if (value === '********' && existing) {
            return true;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            vscode.window.showWarningMessage('Cursor API key was empty.');
            return false;
        }
        await this.secrets.store(constants_1.SECRET_KEYS.CURSOR_API_KEY, trimmed);
        vscode.window.showInformationMessage('Cursor API key saved for Auto Code Fix.');
        return true;
    }
    async run(workItemId, evidence) {
        if (this.running) {
            return { ok: false, message: 'Auto Code Fix is already running.' };
        }
        const enabled = vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('autoFix.enabled', true);
        if (!enabled) {
            return { ok: false, message: 'Auto Code Fix is disabled in settings (autoFix.enabled).' };
        }
        this.running = true;
        const log = (line) => {
            this.output.appendLine(`[AutoFix] ${line}`);
            this.progressPanel?.push({
                phase: 'planning',
                title: 'Auto Code Fix',
                detail: line,
                running: true,
                logLine: line,
            });
        };
        try {
            if (this.progressPanel) {
                this.progressPanel.resetLogs();
                await this.progressPanel.show();
                this.progressPanel.push({
                    phase: 'starting',
                    title: 'Auto Code Fix',
                    detail: 'Validating workspace, Cursor API key, and Azure DevOps…',
                    percent: 5,
                    running: true,
                    logLine: `Auto Code Fix started for #${workItemId}`,
                });
            }
            const workspacePath = (0, workspace_1.getWorkspacePath)();
            if (!workspacePath) {
                throw new Error('Open the target git repository folder first (File → Open Folder).');
            }
            log(`Workspace: ${workspacePath}`);
            let apiKey = await this.secrets.get(constants_1.SECRET_KEYS.CURSOR_API_KEY);
            if (!apiKey) {
                const ok = await this.promptAndStoreCursorApiKey();
                if (!ok) {
                    throw new Error('Cursor API key is required for unattended Auto Code Fix.');
                }
                apiKey = await this.secrets.get(constants_1.SECRET_KEYS.CURSOR_API_KEY);
            }
            if (!apiKey) {
                throw new Error('Cursor API key is required for unattended Auto Code Fix.');
            }
            const authenticated = await this.authService.isAuthenticated();
            if (!authenticated) {
                throw new Error('Connect Azure DevOps first (PAT with Work Items + Code Read & write).');
            }
            const client = await this.workItemService.ensureClient();
            const workItem = await client.getWorkItem(workItemId);
            log(`Work item: #${workItem.id} ${workItem.title}`);
            this.progressPanel?.push({
                phase: 'scanning',
                title: `Branch for #${workItem.id}`,
                detail: 'Creating/checkout fix branch…',
                percent: 15,
                running: true,
                workItemId: workItem.id,
                workItemTitle: workItem.title,
                logLine: 'Ensuring fix branch…',
            });
            const branchResult = await this.git.ensureFixBranch(workItem.id, workItem.title);
            if (!branchResult.branchName) {
                throw new Error(branchResult.message);
            }
            log(branchResult.message);
            const brokenEvidence = evidence ||
                extractBrokenEvidence(workItem) ||
                undefined;
            const prompt = await (0, aiPromptService_1.buildAutoFixPrompt)({
                workItem,
                workspaceFolder: workspacePath,
                workspaceLabel: this.authService.getWorkspaceLabel(),
                projectName: this.authService.getProjectName(),
                orgUrl: this.authService.getOrganizationUrl(),
                webUrl: client.getWorkItemWebUrl(workItem.id),
                evidence: brokenEvidence,
            });
            this.progressPanel?.push({
                phase: 'testing',
                title: 'Cursor SDK agent running',
                detail: 'Unattended fix in progress — do not close the window…',
                percent: 35,
                running: true,
                workItemId: workItem.id,
                workItemTitle: workItem.title,
                logLine: 'Starting Cursor SDK Agent.prompt…',
            });
            const modelId = vscode.workspace
                .getConfiguration('devopsQuickUpdate')
                .get('autoFix.model', 'composer-2.5')
                ?.trim() || 'composer-2.5';
            const agentSummary = await this.runCursorAgent(prompt, apiKey, modelId, workspacePath, log);
            log(`Agent finished: ${agentSummary.slice(0, 240)}`);
            const hasChanges = await this.git.hasUncommittedChanges(workspacePath);
            if (!hasChanges) {
                const message = 'Cursor agent finished but left no git changes. No commit created.';
                await client.addWorkItemComment(workItem.project, workItem.id, [
                    '<b>RubiOps Auto Code Fix</b>',
                    message,
                    `Agent: ${escapeHtml(agentSummary.slice(0, 1500))}`,
                    '<i>RubiOps</i>',
                ].join('<br>'));
                this.progressPanel?.push({
                    phase: 'done',
                    title: 'Auto Code Fix — no changes',
                    detail: message,
                    percent: 100,
                    running: false,
                    logLine: message,
                });
                return { ok: false, message, agentSummary, branchName: branchResult.branchName };
            }
            const diffStat = await this.git.getDiffStat(workspacePath);
            this.progressPanel?.push({
                phase: 'commenting',
                title: 'Commit + push',
                detail: 'Writing the AB# commit and pushing the branch…',
                percent: 75,
                running: true,
                logLine: 'Committing changes…',
            });
            const commitMessage = (0, gitWorkItem_1.formatCommitMessage)(workItem.id, workItem.title);
            await this.git.commitAll(commitMessage, workspacePath);
            log(`Committed: ${commitMessage}`);
            const pushedBranch = await this.git.pushCurrentBranch(workspacePath);
            log(`Pushed branch: ${pushedBranch}`);
            await client.addWorkItemComment(workItem.project, workItem.id, [
                '<b>RubiOps Auto Code Fix</b>',
                `Branch: <code>${escapeHtml(pushedBranch)}</code>`,
                `Commit: <code>${escapeHtml(commitMessage)}</code>`,
                diffStat ? `Diff: <pre>${escapeHtml(diffStat.slice(0, 1500))}</pre>` : '',
                `Agent: ${escapeHtml(agentSummary.slice(0, 1200))}`,
                '<i>RubiOps — review the branch before you merge</i>',
            ].filter(Boolean).join('<br>'));
            const success = `Auto Code Fix complete for #${workItem.id} on ${pushedBranch}`;
            this.notifications.toast(success);
            this.progressPanel?.push({
                phase: 'done',
                title: 'Auto Code Fix complete',
                detail: success,
                percent: 100,
                running: false,
                logLine: success,
                workItemId: workItem.id,
                workItemTitle: workItem.title,
            });
            return {
                ok: true,
                message: success,
                branchName: pushedBranch,
                prUrl: undefined,
                agentSummary,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(`FAILED: ${message}`);
            this.notifications.toast(`Auto Code Fix failed: ${message}`);
            this.progressPanel?.push({
                phase: 'error',
                title: 'Auto Code Fix failed',
                detail: message,
                percent: 100,
                running: false,
                logLine: message,
            });
            try {
                const client = await this.workItemService.ensureClient();
                const workItem = await client.getWorkItem(workItemId);
                await client.addWorkItemComment(workItem.project, workItem.id, [
                    '<b>RubiOps Auto Code Fix — failed</b>',
                    escapeHtml(message),
                    '<i>RubiOps</i>',
                ].join('<br>'));
            }
            catch {
                // ignore secondary failure
            }
            return { ok: false, message };
        }
        finally {
            this.running = false;
        }
    }
    async runCursorAgent(prompt, apiKey, modelId, cwd, log) {
        // Dynamic import — @cursor/sdk is ESM.
        const sdk = (await Promise.resolve().then(() => __importStar(require('@cursor/sdk'))));
        log(`Model: ${modelId}`);
        const result = await sdk.Agent.prompt(prompt, {
            apiKey,
            model: { id: modelId },
            local: { cwd },
        });
        if (result.status === 'error') {
            throw new Error(`Cursor agent run failed: ${result.result || result.status}`);
        }
        return (result.result || `status=${result.status || 'ok'}`).trim();
    }
}
exports.AutoCodeFixService = AutoCodeFixService;
function extractBrokenEvidence(workItem) {
    if (!(0, descriptionBlocks_1.hasDescriptionBlock)(workItem.description, 'Broken Verify')) {
        return undefined;
    }
    const text = workItem.description
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ');
    const match = text.match(/Broken Verify[\s\S]{0,1200}/i);
    return match?.[0]?.trim();
}
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
//# sourceMappingURL=autoCodeFixService.js.map