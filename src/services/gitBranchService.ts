import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { getWorkspacePath } from '../utils/workspace';
import { formatBranchCreatedComment } from '../utils/activityComments';
import { parseWorkItemIdFromBranch } from '../utils/gitWorkItem';
import { GitBranchContext } from '../models/smartInsights';

const execAsync = promisify(exec);

export { formatBranchCreatedComment };

export interface BranchCreateRequest {
  workItemId: number;
  title: string;
  stateName: string;
  createdBy: string;
}

export interface BranchCreateResult {
  created: boolean;
  branchName?: string;
  baseBranch?: string;
  createdBy?: string;
  message: string;
  skipped?: boolean;
}

export class GitBranchService {
  async getBranchContext(): Promise<GitBranchContext> {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { isRepo: false };
    }

    const isRepo = await this.isGitRepository(workspacePath);
    if (!isRepo) {
      return { isRepo: false };
    }

    const branchName = await this.getCurrentBranch(workspacePath);
    const linkedWorkItemId = branchName ? parseWorkItemIdFromBranch(branchName) : undefined;

    return {
      isRepo: true,
      branchName,
      linkedWorkItemId,
    };
  }

  async ensureFixBranch(workItemId: number, title: string): Promise<BranchCreateResult> {
    const workspacePath = getWorkspacePath();
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
      .get<string>('git.branchPattern', 'feature/{id}-{title}');
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

  async getPorcelainStatus(workspacePath?: string): Promise<string> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      return '';
    }
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd });
      return stdout;
    } catch {
      return '';
    }
  }

  async getDiffStat(workspacePath?: string): Promise<string> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      return '';
    }
    try {
      const { stdout } = await execAsync('git diff --stat HEAD', { cwd });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  async getDiffStatAgainst(targetBranch: string, workspacePath?: string): Promise<string> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      return '';
    }
    try {
      const { stdout } = await execAsync(`git diff --stat "origin/${targetBranch}...HEAD"`, { cwd });
      return stdout.trim();
    } catch {
      try {
        const { stdout } = await execAsync(`git diff --stat "${targetBranch}...HEAD"`, { cwd });
        return stdout.trim();
      } catch {
        return this.getDiffStat(cwd);
      }
    }
  }

  async getCommitMessagesSince(targetBranch: string, workspacePath?: string): Promise<string[]> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      return [];
    }
    try {
      const { stdout } = await execAsync(`git log --oneline "origin/${targetBranch}..HEAD"`, { cwd });
      return stdout.trim().split('\n').filter((l) => l.trim().length > 0);
    } catch {
      try {
        const { stdout } = await execAsync(`git log --oneline "${targetBranch}..HEAD"`, { cwd });
        return stdout.trim().split('\n').filter((l) => l.trim().length > 0);
      } catch {
        try {
          const { stdout } = await execAsync('git log -n 5 --oneline', { cwd });
          return stdout.trim().split('\n').filter((l) => l.trim().length > 0);
        } catch {
          return [];
        }
      }
    }
  }

  async hasUncommittedChanges(workspacePath?: string): Promise<boolean> {

    const status = await this.getPorcelainStatus(workspacePath);
    return status.trim().length > 0;
  }

  async commitAll(message: string, workspacePath?: string): Promise<void> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      throw new Error('No workspace path for git commit.');
    }
    await execAsync('git add -A', { cwd });
    const escaped = message.replace(/"/g, '\\"');
    await execAsync(`git commit -m "${escaped}"`, { cwd });
  }

  async pushCurrentBranch(workspacePath?: string): Promise<string> {
    const cwd = workspacePath ?? getWorkspacePath();
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

  async getRemoteOriginUrl(workspacePath?: string): Promise<string | undefined> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      return undefined;
    }
    try {
      const { stdout } = await execAsync('git remote get-url origin', { cwd });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async detectDefaultTargetBranch(workspacePath?: string): Promise<string> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      return 'main';
    }
    const candidates = ['main', 'master', 'develop', 'development'];
    for (const name of candidates) {
      try {
        await execAsync(`git rev-parse --verify origin/${name}`, { cwd });
        return name;
      } catch {
        // try next
      }
    }
    try {
      const { stdout } = await execAsync(
        'git symbolic-ref refs/remotes/origin/HEAD',
        { cwd }
      );
      const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
      if (match?.[1]) {
        return match[1];
      }
    } catch {
      // fall through
    }
    return 'main';
  }

  async maybeCreateBranchForActiveState(
    request: BranchCreateRequest,
    stateCategory: string
  ): Promise<BranchCreateResult> {
    const config = vscode.workspace.getConfiguration('devopsQuickUpdate');
    const enabled = config.get<boolean>('git.createBranchOnActiveState', true);

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

    const workspacePath = getWorkspacePath();
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

    const pattern = config.get<string>('git.branchPattern', 'feature/{id}-{title}');
    const suggestedName = this.buildBranchName(pattern, request.workItemId, request.title);

    const branchName = await this.promptBranchName(
      request.workItemId,
      baseBranch,
      suggestedName
    );

    if (!branchName?.trim()) {
      return { created: false, skipped: true, message: 'Branch creation cancelled.' };
    }

    const trimmedName = branchName.trim();
    const exists = await this.branchExists(workspacePath, trimmedName);
    if (exists) {
      const switchTo = await vscode.window.showWarningMessage(
        `Branch "${trimmedName}" already exists. Switch to it instead?`,
        'Switch',
        'Cancel'
      );
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

  private async promptBranchName(
    workItemId: number,
    baseBranch: string,
    suggestedName: string
  ): Promise<string | undefined> {
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

  private validateBranchName(value: string): string | null {
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

  async getGitUser(workspacePath?: string): Promise<{ name?: string; email?: string }> {
    const cwd = workspacePath ?? getWorkspacePath();
    if (!cwd) {
      return {};
    }
    try {
      const { stdout: name } = await execAsync('git config user.name', { cwd });
      const { stdout: email } = await execAsync('git config user.email', { cwd });
      return { name: name.trim(), email: email.trim() };
    } catch {
      return {};
    }
  }


  private shouldCreateBranch(
    stateCategory: string,
    stateName: string,
    config: vscode.WorkspaceConfiguration
  ): boolean {
    const categories = config.get<string[]>('git.triggerCategories', ['InProgress']);
    if (categories.includes(stateCategory)) {
      return true;
    }

    const triggerStates = config.get<string[]>('git.triggerStateNames', []);
    if (triggerStates.some((s) => s.toLowerCase() === stateName.toLowerCase())) {
      return true;
    }

    const matchActiveName = config.get<boolean>('git.matchActiveStateName', true);
    if (matchActiveName && stateName.toLowerCase().includes('active')) {
      return true;
    }

    return false;
  }

  buildBranchName(pattern: string, workItemId: number, title: string): string {
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

  async getCurrentBranch(workspacePath: string): Promise<string | undefined> {
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
    } catch {
      // fall through
    }

    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workspacePath });
      const branch = stdout.trim();
      return branch && branch !== 'HEAD' ? branch : undefined;
    } catch {
      return undefined;
    }
  }

  private async getCurrentBranchViaGitExtension(
    workspacePath: string
  ): Promise<string | undefined> {
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (!gitExt) {
        return undefined;
      }
      if (!gitExt.isActive) {
        await gitExt.activate();
      }
      const api = gitExt.exports.getAPI(1);
      const repo =
        api.repositories.find(
          (r: { rootUri: vscode.Uri }) =>
            workspacePath === r.rootUri.fsPath ||
            workspacePath.startsWith(`${r.rootUri.fsPath}/`)
        ) ?? api.repositories[0];
      const branch = repo?.state?.HEAD?.name;
      return branch || undefined;
    } catch {
      return undefined;
    }
  }

  private async isGitRepository(workspacePath: string): Promise<boolean> {
    const viaExtension = await this.findGitRepository(workspacePath);
    if (viaExtension) {
      return true;
    }

    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: workspacePath });
      return true;
    } catch {
      return false;
    }
  }

  private async findGitRepository(
    workspacePath: string
  ): Promise<{ rootUri: vscode.Uri } | undefined> {
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (!gitExt) {
        return undefined;
      }
      if (!gitExt.isActive) {
        await gitExt.activate();
      }
      const api = gitExt.exports.getAPI(1);
      return (
        api.repositories.find(
          (r: { rootUri: vscode.Uri }) =>
            workspacePath === r.rootUri.fsPath ||
            workspacePath.startsWith(`${r.rootUri.fsPath}/`)
        ) ?? api.repositories[0]
      );
    } catch {
      return undefined;
    }
  }

  private async branchExists(workspacePath: string, branchName: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify refs/heads/${branchName}`, { cwd: workspacePath });
      return true;
    } catch {
      return false;
    }
  }

  private async createBranchFromCurrent(workspacePath: string, branchName: string): Promise<void> {
    const repo = await this.findGitRepository(workspacePath);
    const viaGitExtension = repo
      ? await this.tryCreateViaGitExtension(repo, branchName)
      : false;
    if (viaGitExtension) {
      return;
    }
    await execAsync(`git checkout -b ${branchName}`, { cwd: workspacePath });
  }

  private async checkoutBranch(workspacePath: string, branchName: string): Promise<void> {
    const repo = await this.findGitRepository(workspacePath);
    if (repo) {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (gitExt?.isActive) {
        const api = gitExt.exports.getAPI(1);
        const matched = api.repositories.find(
          (r: { rootUri: vscode.Uri }) => r.rootUri.fsPath === repo.rootUri.fsPath
        );
        if (matched) {
          await matched.checkout(branchName);
          return;
        }
      }
    }
    await execAsync(`git checkout ${branchName}`, { cwd: workspacePath });
  }

  private async tryCreateViaGitExtension(
    repo: { rootUri: vscode.Uri },
    branchName: string
  ): Promise<boolean> {
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (!gitExt) {
        return false;
      }
      if (!gitExt.isActive) {
        await gitExt.activate();
      }
      const api = gitExt.exports.getAPI(1);
      const matched = api.repositories.find(
        (r: { rootUri: vscode.Uri }) => r.rootUri.fsPath === repo.rootUri.fsPath
      );
      if (!matched) {
        return false;
      }
      await matched.createBranch(branchName, true);
      return true;
    } catch {
      return false;
    }
  }
}
