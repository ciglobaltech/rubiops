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
exports.GitBranchService = exports.formatBranchCreatedComment = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const vscode = __importStar(require("vscode"));
const workspace_1 = require("../utils/workspace");
const activityComments_1 = require("../utils/activityComments");
Object.defineProperty(exports, "formatBranchCreatedComment", { enumerable: true, get: function () { return activityComments_1.formatBranchCreatedComment; } });
const gitWorkItem_1 = require("../utils/gitWorkItem");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class GitBranchService {
    async getBranchContext() {
        const workspacePath = (0, workspace_1.getWorkspacePath)();
        if (!workspacePath) {
            return { isRepo: false };
        }
        const isRepo = await this.isGitRepository(workspacePath);
        if (!isRepo) {
            return { isRepo: false };
        }
        const branchName = await this.getCurrentBranch(workspacePath);
        const linkedWorkItemId = branchName ? (0, gitWorkItem_1.parseWorkItemIdFromBranch)(branchName) : undefined;
        return {
            isRepo: true,
            branchName,
            linkedWorkItemId,
        };
    }
    async ensureFixBranch(workItemId, title) {
        const workspacePath = (0, workspace_1.getWorkspacePath)();
        if (!workspacePath) {
            return { created: false, message: 'Open a workspace folder with a git repository first.' };
        }
        const isRepo = await this.isGitRepository(workspacePath);
        if (!isRepo) {
            return { created: false, message: 'Current workspace folder is not a git repository.' };
        }
        const dirty = await this.getPorcelainStatus(workspacePath);
        if (dirty.trim()) {
            return {
                created: false,
                message: `Working tree is dirty. Commit or stash first:\n${dirty.slice(0, 500)}`,
            };
        }
        const baseBranch = await this.getCurrentBranch(workspacePath);
        if (!baseBranch) {
            return { created: false, message: 'Could not detect the current git branch.' };
        }
        const pattern = vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('git.branchPattern', 'feature/{id}-{title}');
        const branchName = this.buildBranchName(pattern, workItemId, title);
        const exists = await this.branchExists(workspacePath, branchName);
        if (exists) {
            await this.checkoutBranch(workspacePath, branchName);
            return {
                created: false,
                branchName,
                baseBranch,
                message: `Switched to existing branch "${branchName}".`,
            };
        }
        await this.createBranchFromCurrent(workspacePath, branchName);
        return {
            created: true,
            branchName,
            baseBranch,
            message: `Created "${branchName}" from "${baseBranch}".`,
        };
    }
    async getPorcelainStatus(workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            return '';
        }
        try {
            const { stdout } = await execAsync('git status --porcelain', { cwd });
            return stdout;
        }
        catch {
            return '';
        }
    }
    async getDiffStat(workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            return '';
        }
        try {
            const { stdout } = await execAsync('git diff --stat HEAD', { cwd });
            return stdout.trim();
        }
        catch {
            return '';
        }
    }
    async getDiffStatAgainst(targetBranch, workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            return '';
        }
        try {
            const { stdout } = await execAsync(`git diff --stat "origin/${targetBranch}...HEAD"`, { cwd });
            return stdout.trim();
        }
        catch {
            try {
                const { stdout } = await execAsync(`git diff --stat "${targetBranch}...HEAD"`, { cwd });
                return stdout.trim();
            }
            catch {
                return this.getDiffStat(cwd);
            }
        }
    }
    async getCommitMessagesSince(targetBranch, workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            return [];
        }
        try {
            const { stdout } = await execAsync(`git log --oneline "origin/${targetBranch}..HEAD"`, { cwd });
            return stdout.trim().split('\n').filter((l) => l.trim().length > 0);
        }
        catch {
            try {
                const { stdout } = await execAsync(`git log --oneline "${targetBranch}..HEAD"`, { cwd });
                return stdout.trim().split('\n').filter((l) => l.trim().length > 0);
            }
            catch {
                try {
                    const { stdout } = await execAsync('git log -n 5 --oneline', { cwd });
                    return stdout.trim().split('\n').filter((l) => l.trim().length > 0);
                }
                catch {
                    return [];
                }
            }
        }
    }
    async hasUncommittedChanges(workspacePath) {
        const status = await this.getPorcelainStatus(workspacePath);
        return status.trim().length > 0;
    }
    async commitAll(message, workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            throw new Error('No workspace path for git commit.');
        }
        await execAsync('git add -A', { cwd });
        const escaped = message.replace(/"/g, '\\"');
        await execAsync(`git commit -m "${escaped}"`, { cwd });
    }
    async pushCurrentBranch(workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            throw new Error('No workspace path for git push.');
        }
        const branch = await this.getCurrentBranch(cwd);
        if (!branch) {
            throw new Error('No current branch to push.');
        }
        await execAsync(`git push -u origin "${branch}"`, { cwd, timeout: 120_000 });
        return branch;
    }
    async getRemoteOriginUrl(workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            return undefined;
        }
        try {
            const { stdout } = await execAsync('git remote get-url origin', { cwd });
            return stdout.trim() || undefined;
        }
        catch {
            return undefined;
        }
    }
    async detectDefaultTargetBranch(workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            return 'main';
        }
        const candidates = ['main', 'master', 'develop', 'development'];
        for (const name of candidates) {
            try {
                await execAsync(`git rev-parse --verify origin/${name}`, { cwd });
                return name;
            }
            catch {
                // try next
            }
        }
        try {
            const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD', { cwd });
            const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
            if (match?.[1]) {
                return match[1];
            }
        }
        catch {
            // fall through
        }
        return 'main';
    }
    async maybeCreateBranchForActiveState(request, stateCategory) {
        const config = vscode.workspace.getConfiguration('devopsQuickUpdate');
        const enabled = config.get('git.createBranchOnActiveState', true);
        if (!enabled) {
            return { created: false, skipped: true, message: 'Branch creation is disabled in settings.' };
        }
        if (!this.shouldCreateBranch(stateCategory, request.stateName, config)) {
            return {
                created: false,
                skipped: true,
                message: `State "${request.stateName}" does not trigger branch creation.`,
            };
        }
        const workspacePath = (0, workspace_1.getWorkspacePath)();
        if (!workspacePath) {
            return { created: false, message: 'Open a workspace folder with a git repository first.' };
        }
        const isRepo = await this.isGitRepository(workspacePath);
        if (!isRepo) {
            return { created: false, message: 'Current workspace folder is not a git repository.' };
        }
        const baseBranch = await this.getCurrentBranch(workspacePath);
        if (!baseBranch) {
            return { created: false, message: 'Could not detect the current git branch.' };
        }
        const pattern = config.get('git.branchPattern', 'feature/{id}-{title}');
        const suggestedName = this.buildBranchName(pattern, request.workItemId, request.title);
        const branchName = await this.promptBranchName(request.workItemId, baseBranch, suggestedName);
        if (!branchName?.trim()) {
            return { created: false, skipped: true, message: 'Branch creation cancelled.' };
        }
        const trimmedName = branchName.trim();
        const exists = await this.branchExists(workspacePath, trimmedName);
        if (exists) {
            const switchTo = await vscode.window.showWarningMessage(`Branch "${trimmedName}" already exists. Switch to it instead?`, 'Switch', 'Cancel');
            if (switchTo === 'Switch') {
                await this.checkoutBranch(workspacePath, trimmedName);
                return {
                    created: false,
                    branchName: trimmedName,
                    baseBranch,
                    createdBy: request.createdBy,
                    message: `Switched to existing branch "${trimmedName}".`,
                };
            }
            return { created: false, branchName: trimmedName, message: 'Branch already exists — cancelled.' };
        }
        await this.createBranchFromCurrent(workspacePath, trimmedName);
        return {
            created: true,
            branchName: trimmedName,
            baseBranch,
            createdBy: request.createdBy,
            message: `Created "${trimmedName}" from base "${baseBranch}".`,
        };
    }
    async promptBranchName(workItemId, baseBranch, suggestedName) {
        // Input boxes opened from webview message handlers need a short defer so VS Code can show them.
        await new Promise((resolve) => setTimeout(resolve, 100));
        return vscode.window.showInputBox({
            title: `Create branch for work item #${workItemId}`,
            prompt: `Base: ${baseBranch} (current branch). Confirm or edit the new branch name:`,
            value: suggestedName,
            ignoreFocusOut: true,
            validateInput: (value) => this.validateBranchName(value),
        });
    }
    validateBranchName(value) {
        const trimmed = value.trim();
        if (!trimmed) {
            return 'Branch name is required';
        }
        if (!/^[a-zA-Z0-9/._-]+$/.test(trimmed)) {
            return 'Use only letters, numbers, /, ., _, -';
        }
        if (trimmed.endsWith('/') || trimmed.startsWith('/')) {
            return 'Branch name cannot start or end with /';
        }
        return null;
    }
    async getGitUser(workspacePath) {
        const cwd = workspacePath ?? (0, workspace_1.getWorkspacePath)();
        if (!cwd) {
            return {};
        }
        try {
            const { stdout: name } = await execAsync('git config user.name', { cwd });
            const { stdout: email } = await execAsync('git config user.email', { cwd });
            return { name: name.trim(), email: email.trim() };
        }
        catch {
            return {};
        }
    }
    shouldCreateBranch(stateCategory, stateName, config) {
        const categories = config.get('git.triggerCategories', ['InProgress']);
        if (categories.includes(stateCategory)) {
            return true;
        }
        const triggerStates = config.get('git.triggerStateNames', []);
        if (triggerStates.some((s) => s.toLowerCase() === stateName.toLowerCase())) {
            return true;
        }
        const matchActiveName = config.get('git.matchActiveStateName', true);
        if (matchActiveName && stateName.toLowerCase().includes('active')) {
            return true;
        }
        return false;
    }
    buildBranchName(pattern, workItemId, title) {
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 50);
        return pattern
            .replace('{id}', String(workItemId))
            .replace('{title}', slug || 'task')
            .replace(/[^a-zA-Z0-9/._-]/g, '-')
            .replace(/--+/g, '-');
    }
    async getCurrentBranch(workspacePath) {
        const viaExtension = await this.getCurrentBranchViaGitExtension(workspacePath);
        if (viaExtension) {
            return viaExtension;
        }
        try {
            const { stdout } = await execAsync('git branch --show-current', { cwd: workspacePath });
            const branch = stdout.trim();
            if (branch && branch !== 'HEAD') {
                return branch;
            }
        }
        catch {
            // fall through
        }
        try {
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workspacePath });
            const branch = stdout.trim();
            return branch && branch !== 'HEAD' ? branch : undefined;
        }
        catch {
            return undefined;
        }
    }
    async getCurrentBranchViaGitExtension(workspacePath) {
        try {
            const gitExt = vscode.extensions.getExtension('vscode.git');
            if (!gitExt) {
                return undefined;
            }
            if (!gitExt.isActive) {
                await gitExt.activate();
            }
            const api = gitExt.exports.getAPI(1);
            const repo = api.repositories.find((r) => workspacePath === r.rootUri.fsPath ||
                workspacePath.startsWith(`${r.rootUri.fsPath}/`)) ?? api.repositories[0];
            const branch = repo?.state?.HEAD?.name;
            return branch || undefined;
        }
        catch {
            return undefined;
        }
    }
    async isGitRepository(workspacePath) {
        const viaExtension = await this.findGitRepository(workspacePath);
        if (viaExtension) {
            return true;
        }
        try {
            await execAsync('git rev-parse --is-inside-work-tree', { cwd: workspacePath });
            return true;
        }
        catch {
            return false;
        }
    }
    async findGitRepository(workspacePath) {
        try {
            const gitExt = vscode.extensions.getExtension('vscode.git');
            if (!gitExt) {
                return undefined;
            }
            if (!gitExt.isActive) {
                await gitExt.activate();
            }
            const api = gitExt.exports.getAPI(1);
            return (api.repositories.find((r) => workspacePath === r.rootUri.fsPath ||
                workspacePath.startsWith(`${r.rootUri.fsPath}/`)) ?? api.repositories[0]);
        }
        catch {
            return undefined;
        }
    }
    async branchExists(workspacePath, branchName) {
        try {
            await execAsync(`git rev-parse --verify refs/heads/${branchName}`, { cwd: workspacePath });
            return true;
        }
        catch {
            return false;
        }
    }
    async createBranchFromCurrent(workspacePath, branchName) {
        const repo = await this.findGitRepository(workspacePath);
        const viaGitExtension = repo
            ? await this.tryCreateViaGitExtension(repo, branchName)
            : false;
        if (viaGitExtension) {
            return;
        }
        await execAsync(`git checkout -b ${branchName}`, { cwd: workspacePath });
    }
    async checkoutBranch(workspacePath, branchName) {
        const repo = await this.findGitRepository(workspacePath);
        if (repo) {
            const gitExt = vscode.extensions.getExtension('vscode.git');
            if (gitExt?.isActive) {
                const api = gitExt.exports.getAPI(1);
                const matched = api.repositories.find((r) => r.rootUri.fsPath === repo.rootUri.fsPath);
                if (matched) {
                    await matched.checkout(branchName);
                    return;
                }
            }
        }
        await execAsync(`git checkout ${branchName}`, { cwd: workspacePath });
    }
    async tryCreateViaGitExtension(repo, branchName) {
        try {
            const gitExt = vscode.extensions.getExtension('vscode.git');
            if (!gitExt) {
                return false;
            }
            if (!gitExt.isActive) {
                await gitExt.activate();
            }
            const api = gitExt.exports.getAPI(1);
            const matched = api.repositories.find((r) => r.rootUri.fsPath === repo.rootUri.fsPath);
            if (!matched) {
                return false;
            }
            await matched.createBranch(branchName, true);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.GitBranchService = GitBranchService;
//# sourceMappingURL=gitBranchService.js.map