/**
 * Code Review and Merge Review, placed from Jessie's flow.
 * Azure branch or local folder for a review. Base branch to head branch for a merge.
 * The report is written here and answered by the AI already signed in.
 */

import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { parseAdoGitRemote } from './adoPullRequestService';
import { AgentPlatform, askAgentPlatform, choosePlatform, listAgentPlatforms } from './agentPlatform';
import { recordTokenUse } from './tokenOptimizer';
import { COMMANDS } from '../utils/constants';
import { showHtmlReport, writeHtmlReport } from '../utils/htmlReport';
import { getWorkspacePath } from '../utils/workspace';
import { FlutterRefactorService } from './flutterRefactorService';
import { RefactorPreviewPanel } from '../views/refactorPreviewPanel';

const PLATFORM_KEY = 'rubiops.agentPlatformId';
const LEGACY_PLATFORM_KEY = 'smartgenie.agentPlatformId';
const SOURCE_FILE = /\.(dart|ts|tsx|js|jsx|py|cs|java|kt|php|vue|html|css|json|yaml|yml)$/i;
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.dart_tool', 'coverage', 'out', '.next']);

interface AzureRepo {
  org: string;
  project: string;
  repository: string;
  pat: string;
}

export class ReviewService {
  private running = false;
  private readonly status: vscode.StatusBarItem;
  private lastReportFile?: string;
  private lastReportTitle?: string;

  constructor(
    private readonly auth: AuthService,
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState: vscode.Memento,
    private readonly refactorService?: FlutterRefactorService,
    private readonly extensionUri?: vscode.Uri
  ) {
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
    this.status.command = COMMANDS.OPEN_LAST_REPORT;
    this.lastReportFile = this.globalState.get<string>('rubiops.lastReportFile') || this.globalState.get<string>('devopsNexa.lastReportFile');
    this.lastReportTitle = this.globalState.get<string>('rubiops.lastReportTitle') || this.globalState.get<string>('devopsNexa.lastReportTitle');
    if (this.lastReportFile) {
      this.status.text = '$(file-code) RubiOps — report';
      this.status.tooltip = `Click to view report: ${this.lastReportTitle || 'Last review report'}`;
      this.status.show();
    }
  }

  async openLastReport(): Promise<void> {
    const file = this.lastReportFile || this.globalState.get<string>('rubiops.lastReportFile') || this.globalState.get<string>('devopsNexa.lastReportFile');
    const title = this.lastReportTitle || this.globalState.get<string>('rubiops.lastReportTitle') || this.globalState.get<string>('devopsNexa.lastReportTitle');
    if (file) {
      try {
        await showHtmlReport(file, title);
      } catch (err) {
        await vscode.env.openExternal(vscode.Uri.file(file));
      }
    } else {
      vscode.window.showInformationMessage('No review report has been generated yet.');
    }
  }

  dispose(): void {
    this.status.dispose();
  }

  async startCodeReview(): Promise<void> {
    if (this.running) {
      vscode.window.showWarningMessage('A RubiOps review is already running.');
      return;
    }
    const mode = await vscode.window.showQuickPick(
      [
        { label: '$(cloud) Azure DevOps branch', description: 'Clone URL is the open repo · pick a branch', mode: 'azure' },
        { label: '$(folder) Local workspace folder', description: 'Review the files in this window', mode: 'local' },
      ],
      { title: 'RubiOps Code Review', placeHolder: 'How should RubiOps get the code?', ignoreFocusOut: true }
    );
    if (!mode) {
      return;
    }
    await this.run('Code review', async () => {
      const slice = mode.mode === 'azure' ? await this.azureBranchSlice() : await this.localFolderSlice();
      if (!slice) {
        return;
      }

      const isFlutter = (await this.refactorService?.isFlutterWorkspace()) || slice.includes('.dart') || slice.includes('flutter');

      const prompt = isFlutter
        ? [
            'You are RubiOps\'s senior Flutter & Dart code reviewer and architecture auditor.',
            'Audit the code according to strict modern Flutter (Flutter 3.x+) & Effective Dart standards:',
            '1. Modern Flutter 3.x+ Deprecations: withOpacity() must be withValues(alpha: ...), MaterialState* must be WidgetState* (WidgetStatePropertyAll, WidgetStateColor, etc.), textScaleFactor must be textScaler: TextScaler.linear(...)',
            '2. Performance & Rebuilds: Prefer const constructors on widgets (e.g. const SizedBox(), const CircularProgressIndicator()), avoid unnecessary Container() (use const SizedBox.shrink()), avoid deeply nested widgets',
            '3. Controllers & Lifecycles: ScrollController, TextEditingController, AnimationController must be disposed in dispose()',
            '4. Async Safety: Avoid BuildContext across async gaps without mounted checks',
            '5. Effective Dart: Prefer const over final for compile-time literal values (e.g. const service = "s3")',
            '',
            'Reply in markdown with these sections:',
            '# RubiOps — Flutter Standard Code Review',
            '**Score:** N/100',
            '**Grade:** A, B, C, D, or F',
            '**Files:** count',
            '## Summary',
            '## Flutter Architecture & Layer Scores',
            'A table for Presentation / Widgets, Business Logic / State, and Services / Data, each as a score out of 100.',
            '## Flutter Standards & Deprecations (Flutter 3.x+)',
            'Highlight detected deprecations (withOpacity, MaterialState, textScaleFactor) and state management best practices.',
            '## What needs to change',
            'Each item has severity, title, file, and concrete fix.',
            '## What is missing (const constructors, dispose calls, mounted guards)',
            '## File-by-file changes',
            '## Refactor Preview Actionable Fixes',
            'Provide concrete search-and-replace fixes in a JSON block:',
            '```json:flutter-refactor-fixes',
            '[',
            '  {',
            '    "file": "relative/path/to/file.dart",',
            '    "original": "exact original snippet to replace",',
            '    "replacement": "modern flutter standard replacement",',
            '    "description": "Rule explanation"',
            '  }',
            ']',
            '```',
            '## Test checklist',
            '',
            slice,
          ].join('\n')
        : [
            'You are RubiOps\'s code reviewer. Use only the code below.',
            'Reply in markdown with these sections:',
            '# RubiOps — Code Review Impact',
            '**Score:** N/100',
            '**Grade:** A, B, C, D, or F',
            '**Files:** count',
            '## Summary',
            '## Layer scores',
            'A table for Frontend, Backend, and Database, each as a score out of 100.',
            '## What needs to change',
            'Each item has severity, title, file, and fix.',
            '## What is missing',
            '## File-by-file changes',
            '## Findings',
            '## Test checklist',
            '',
            slice,
          ].join('\n');

      const report = await this.ask(prompt);

      let reportWithBanner = report;
      let fixesCount = 0;
      if (this.refactorService) {
        const localFixes = await this.refactorService.scanWorkspace();
        const allFixes = this.refactorService.mergeAiReviewFixes(localFixes, report);
        fixesCount = allFixes.reduce((acc, g) => acc + g.fixes.length, 0);

        if (fixesCount > 0) {
          const filesCount = allFixes.length;
          const banner = [
            `> ⚡ **Flutter Standards Refactor Preview Ready**: Found **${fixesCount}** actionable fixes across **${filesCount}** files (including \`withValues\`, \`WidgetState\`, \`const\` constructors).`,
            `> Open the **Refactor Preview** panel and click **[ Apply ]** to update your code automatically.`,
            '',
          ].join('\n');
          reportWithBanner = `${banner}\n${report}`;
        }
      }

      const file = await writeReport('code-review', reportWithBanner);
      const score = readScore(report);
      this.lastReportFile = file;
      this.lastReportTitle = isFlutter ? 'RubiOps — Flutter Standard Review' : 'RubiOps — Code Review';
      void this.globalState.update('rubiops.lastReportFile', file);
      void this.globalState.update('rubiops.lastReportTitle', this.lastReportTitle);
      this.status.text = score ? `$(search) RubiOps — ${score}` : '$(search) RubiOps — code review ready';
      this.status.tooltip = `Click to view report: Code review ready${score ? ` · ${score}` : ''}${fixesCount ? ` (${fixesCount} Flutter fixes available)` : ''}`;
      this.status.command = COMMANDS.OPEN_LAST_REPORT;
      this.status.show();
      await finishReport(`Code review ready${score ? ` · ${score}` : ''}${fixesCount ? ` · ${fixesCount} Flutter fixes ready` : ''}`, file, this.lastReportTitle);

      if (fixesCount > 0 && this.refactorService && this.extensionUri) {
        await RefactorPreviewPanel.show(this.extensionUri, this.refactorService);
      }
    });
  }

  async startMergeReview(): Promise<void> {
    if (this.running) {
      vscode.window.showWarningMessage('A RubiOps merge review is already running.');
      return;
    }
    await this.run('Merge review', async () => {
      const branches = await this.loadBranches();
      if (!branches.length) {
        throw new Error('No branches found. Open the git project or connect Azure DevOps.');
      }
      const preferredBase = branches.find((name) => ['main', 'master', 'develop'].includes(name)) ?? branches[0];
      const base = await pickBranch(branches, 'Select BASE branch (target)', preferredBase);
      if (!base) {
        return;
      }
      const current = await this.currentBranch();
      const preferredHead = branches.find((name) => name === current && name !== base) ?? branches.find((name) => name !== base) ?? branches[0];
      const head = await pickBranch(branches, 'Select HEAD branch (source)', preferredHead);
      if (!head) {
        return;
      }
      if (base === head) {
        vscode.window.showWarningMessage('Base and head branches must be different.');
        return;
      }
      const diff = await this.mergeSlice(base, head);
      const isFlutter = (await this.refactorService?.isFlutterWorkspace()) || diff.includes('.dart');

      const prompt = [
        'You are RubiOps\'s merge reviewer.',
        isFlutter ? 'Audit the diff strictly against modern Flutter (Flutter 3.x+) & Effective Dart standards.' : 'Use only this diff.',
        `Base: ${base}`,
        `Head: ${head}`,
        'Reply in markdown with these sections:',
        '# RubiOps — Merge Impact',
        '**Verdict:** approve or needs_changes',
        '**Score:** N/100',
        '**Grade:** A, B, C, D, or F',
        '## Summary',
        '## UI changes users will notice',
        '## Functionality / behaviour changes',
        '## Issues you may face',
        'Each issue includes why and how to verify.',
        isFlutter ? '## Flutter Standards & Deprecations' : '',
        '## Test checklist',
        '',
        diff,
      ].filter(Boolean).join('\n');

      const report = await this.ask(prompt);

      let reportWithBanner = report;
      let fixesCount = 0;
      if (this.refactorService && isFlutter) {
        const localFixes = await this.refactorService.scanWorkspace();
        const allFixes = this.refactorService.mergeAiReviewFixes(localFixes, report);
        fixesCount = allFixes.reduce((acc, g) => acc + g.fixes.length, 0);

        if (fixesCount > 0) {
          const filesCount = allFixes.length;
          const banner = [
            `> ⚡ **Flutter Standards Refactor Preview Ready**: Found **${fixesCount}** actionable fixes across **${filesCount}** files.`,
            `> Open the **Refactor Preview** panel and click **[ Apply ]** to update your code automatically.`,
            '',
          ].join('\n');
          reportWithBanner = `${banner}\n${report}`;
        }
      }

      const file = await writeReport('merge-review', reportWithBanner);
      const score = readScore(report);
      const verdict = report.match(/\*\*Verdict:\*\*\s*([A-Za-z_]+)/)?.[1] ?? '';
      this.lastReportFile = file;
      this.lastReportTitle = isFlutter ? 'RubiOps — Flutter Merge Review' : 'RubiOps — Merge Review';
      void this.globalState.update('rubiops.lastReportFile', file);
      void this.globalState.update('rubiops.lastReportTitle', this.lastReportTitle);
      this.status.text = `$(git-merge) RubiOps — ${verdict || 'merge'} ${score}`.trim();
      this.status.tooltip = `Click to view report: Merge review ready${verdict ? ` · ${verdict}` : ''}${score ? ` · ${score}` : ''}${fixesCount ? ` (${fixesCount} fixes available)` : ''}`;
      this.status.command = COMMANDS.OPEN_LAST_REPORT;
      this.status.show();
      await finishReport(`Merge review ready${verdict ? ` · ${verdict}` : ''}${score ? ` · ${score}` : ''}`, file, this.lastReportTitle);

      if (fixesCount > 0 && this.refactorService && this.extensionUri) {
        await RefactorPreviewPanel.show(this.extensionUri, this.refactorService);
      }
    });
  }

  private async run(title: string, work: () => Promise<void>): Promise<void> {
    this.running = true;
    this.status.text = `$(loading~spin) RubiOps — ${title.toLowerCase()}...`;
    this.status.show();
    try {
      await work();
    } catch (error) {
      this.status.text = '$(error) RubiOps — review failed';
      const message = error instanceof Error ? error.message : 'Review failed.';
      vscode.window.showErrorMessage(message);
    } finally {
      this.running = false;
    }
  }

  private async ask(prompt: string): Promise<string> {
    const platform = await this.platform();
    const budget = await recordTokenUse(prompt, prompt, 'review');
    if (budget.exhausted) {
      throw new Error(budget.text);
    }
    return askAgentPlatform(platform, prompt, this.secrets);
  }

  private async platform(): Promise<AgentPlatform> {
    const platforms = await listAgentPlatforms();
    const selected = choosePlatform(platforms, this.globalState.get<string>(PLATFORM_KEY) || this.globalState.get<string>(LEGACY_PLATFORM_KEY));
    if (!selected) {
      throw new Error('Sign in to Copilot, Claude, or Continue, then open the Agent and pick it.');
    }
    return selected;
  }

  private async localFolderSlice(): Promise<string | undefined> {
    const cwd = getWorkspacePath();
    if (!cwd) {
      throw new Error('Open a workspace folder to review locally.');
    }
    const files = await collectSourceFiles(cwd);
    if (!files.length) {
      throw new Error('No source files were found in this folder.');
    }
    return `Local folder: ${cwd}\n\n${files.join('\n\n')}`;
  }

  private async azureBranchSlice(): Promise<string | undefined> {
    const repo = await this.azureRepo();
    if (!repo) {
      return undefined;
    }
    const branches = await azureBranches(repo);
    const preferred = branches.find((name) => ['main', 'master', 'develop'].includes(name)) ?? branches[0];
    const branch = await pickBranch(branches, 'Select branch to review', preferred);
    if (!branch) {
      return undefined;
    }
    const cwd = getWorkspacePath();
    if (cwd && (await gitOk(cwd, ['rev-parse', '--verify', branch]))) {
      const names = (await git(cwd, ['ls-tree', '-r', '--name-only', branch])).split('\n').filter((name) => SOURCE_FILE.test(name));
      const chunks: string[] = [];
      let used = 0;
      for (const name of names.slice(0, 16)) {
        if (used > 11000) {
          break;
        }
        const body = (await git(cwd, ['show', `${branch}:${name}`])).slice(0, 1200);
        used += body.length;
        chunks.push(`FILE ${name}\n${body}`);
      }
      if (chunks.length) {
        return `Azure branch ${branch} from the local git history\n\n${chunks.join('\n\n')}`;
      }
    }
    const files = await azureFileSlice(repo, branch);
    return `Azure branch ${branch} · ${repo.org}/${repo.project}/${repo.repository}\n\n${files}`;
  }

  private async loadBranches(): Promise<string[]> {
    const repo = await this.azureRepo(false);
    if (repo) {
      try {
        return await azureBranches(repo);
      } catch {
        // The local git list is the fallback when Azure refs cannot be read.
      }
    }
    const cwd = getWorkspacePath();
    if (!cwd) {
      return [];
    }
    try {
      const raw = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin']);
      const names = raw
        .split('\n')
        .map((name) => name.trim().replace(/^origin\//, ''))
        .filter((name) => name && name !== 'HEAD' && safeRef(name));
      return [...new Set(names)];
    } catch {
      return [];
    }
  }

  private async currentBranch(): Promise<string> {
    const cwd = getWorkspacePath();
    if (!cwd) {
      return '';
    }
    try {
      return (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    } catch {
      return '';
    }
  }

  private async mergeSlice(base: string, head: string): Promise<string> {
    const cwd = getWorkspacePath();
    if (cwd) {
      const spec = await firstSpec(cwd, [
        [`origin/${base}...origin/${head}`],
        [`${base}...${head}`],
        [`origin/${base}...${head}`],
      ]);
      if (spec) {
        const stat = await git(cwd, ['diff', '--stat', spec]);
        const patch = (await git(cwd, ['diff', '--unified=2', spec])).slice(0, 12000);
        return `Diff ${spec}\n\n${stat}\n\n${patch}`;
      }
    }
    const repo = await this.azureRepo();
    if (!repo) {
      throw new Error(`Could not diff ${base} and ${head}. Fetch those branches or connect Azure DevOps.`);
    }
    const changes = await azureChangedPaths(repo, base, head);
    const chunks = [`Changed paths (${base} → ${head})`, ...changes.slice(0, 30)];
    for (const filePath of changes.filter((name) => SOURCE_FILE.test(name)).slice(0, 8)) {
      const body = await azureFileContent(repo, head, filePath);
      if (body) {
        chunks.push(`FILE ${filePath}\n${body.slice(0, 1200)}`);
      }
    }
    return chunks.join('\n\n');
  }

  private async azureRepo(require = true): Promise<AzureRepo | undefined> {
    const pat = await this.auth.getPat();
    const orgUrl = this.auth.getOrganizationUrl();
    if (!pat || !orgUrl) {
      if (!require) {
        return undefined;
      }
      const choice = await vscode.window.showWarningMessage('Connect Azure DevOps to read branches.', 'Connect');
      if (choice === 'Connect') {
        await vscode.commands.executeCommand(COMMANDS.CONNECT);
      }
      return undefined;
    }
    const cwd = getWorkspacePath();
    let remote = '';
    if (cwd) {
      try {
        remote = (await git(cwd, ['remote', 'get-url', 'origin'])).trim();
      } catch {
        remote = '';
      }
    }
    const parsed = remote ? parseAdoGitRemote(remote) : undefined;
    if (parsed) {
      return { org: parsed.organization, project: parsed.project, repository: parsed.repository, pat };
    }
    if (!require) {
      return undefined;
    }
    throw new Error('This folder has no Azure DevOps origin remote. Review the local folder, or open the cloned repo.');
  }
}

async function pickBranch(branches: string[], title: string, preferred?: string): Promise<string | undefined> {
  const pick = await vscode.window.showQuickPick(
    branches.map((name) => ({ label: name, description: name === preferred ? 'suggested' : undefined })),
    { title, placeHolder: title, ignoreFocusOut: true, matchOnDescription: true }
  );
  return pick?.label;
}

async function finishReport(summary: string, file: string, title?: string): Promise<void> {
  let panel: vscode.WebviewPanel | undefined;
  try {
    panel = await showHtmlReport(file, title);
  } catch (err) {
    console.error('Failed to display webview report:', err);
    try {
      await vscode.env.openExternal(vscode.Uri.file(file));
    } catch {
      const doc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(doc);
    }
  }

  void vscode.window.showInformationMessage(summary, 'View Report', 'Open in Browser').then(async (choice) => {
    if (choice === 'View Report') {
      if (panel) {
        panel.reveal(panel.viewColumn || vscode.ViewColumn.Beside);
      } else {
        await showHtmlReport(file, title);
      }
    } else if (choice === 'Open in Browser') {
      await vscode.env.openExternal(vscode.Uri.file(file));
    }
  });
}

async function writeReport(kind: string, body: string): Promise<string> {
  return writeHtmlReport(kind, body);
}

function readScore(report: string): string {
  const score = report.match(/\*\*Score:\*\*\s*(\d+\s*\/\s*100)/i)?.[1]?.replace(/\s/g, '');
  const grade = report.match(/\*\*Grade:\*\*\s*([A-F])/i)?.[1];
  if (!score) {
    return '';
  }
  return grade ? `${score} (${grade})` : score;
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 5 || found.length >= 16) {
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (found.length >= 16) {
        return;
      }
      if (entry.name.startsWith('.') || SKIP_DIR.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!SOURCE_FILE.test(entry.name) || /secret|credential|\.env/i.test(entry.name)) {
        continue;
      }
      const body = (await fs.readFile(full, 'utf8').catch(() => '')).slice(0, 1200);
      if (body.trim()) {
        found.push(`FILE ${path.relative(root, full)}\n${body}`);
      }
    }
  }
  await walk(root, 0);
  return found;
}

function safeRef(name: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.includes('..');
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 2_000_000, timeout: 25000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.toString());
    });
  });
}

async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

async function firstSpec(cwd: string, specs: string[][]): Promise<string | undefined> {
  for (const [spec] of specs) {
    const parts = spec.split('...');
    if (parts.length === 2 && safeRef(parts[0].replace(/^origin\//, '')) && safeRef(parts[1].replace(/^origin\//, ''))) {
      if (await gitOk(cwd, ['rev-parse', '--verify', parts[0]]) && (await gitOk(cwd, ['rev-parse', '--verify', parts[1]]))) {
        return spec;
      }
    }
  }
  return undefined;
}

function adoHeaders(pat: string): { Authorization: string } {
  return { Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}` };
}

async function azureBranches(repo: AzureRepo): Promise<string[]> {
  const url = `https://dev.azure.com/${encodeURIComponent(repo.org)}/${encodeURIComponent(repo.project)}/_apis/git/repositories/${encodeURIComponent(repo.repository)}/refs?filter=heads/&api-version=7.1`;
  const response = await axios.get<{ value?: Array<{ name?: string }> }>(url, { headers: adoHeaders(repo.pat), timeout: 30000 });
  const names = (response.data.value ?? [])
    .map((item) => (item.name ?? '').replace(/^refs\/heads\//, ''))
    .filter(safeRef);
  if (!names.length) {
    throw new Error('No branches returned. Check the repo and PAT Code Read scope.');
  }
  return names;
}

async function azureFileSlice(repo: AzureRepo, branch: string): Promise<string> {
  const url = `https://dev.azure.com/${encodeURIComponent(repo.org)}/${encodeURIComponent(repo.project)}/_apis/git/repositories/${encodeURIComponent(repo.repository)}/items?recursionLevel=Full&versionDescriptor.version=${encodeURIComponent(branch)}&versionDescriptor.versionType=branch&api-version=7.1`;
  const response = await axios.get<{ value?: Array<{ path?: string; gitObjectType?: string }> }>(url, {
    headers: adoHeaders(repo.pat),
    timeout: 30000,
  });
  const paths = (response.data.value ?? [])
    .map((item) => item.path ?? '')
    .filter((itemPath) => SOURCE_FILE.test(itemPath))
    .slice(0, 8);
  const chunks: string[] = [];
  for (const itemPath of paths) {
    const body = await azureFileContent(repo, branch, itemPath);
    if (body) {
      chunks.push(`FILE ${itemPath}\n${body.slice(0, 1200)}`);
    }
  }
  if (!chunks.length) {
    throw new Error(`No source files were readable on ${branch}.`);
  }
  return chunks.join('\n\n');
}

async function azureFileContent(repo: AzureRepo, branch: string, itemPath: string): Promise<string> {
  const url = `https://dev.azure.com/${encodeURIComponent(repo.org)}/${encodeURIComponent(repo.project)}/_apis/git/repositories/${encodeURIComponent(repo.repository)}/items?path=${encodeURIComponent(itemPath)}&includeContent=true&versionDescriptor.version=${encodeURIComponent(branch)}&versionDescriptor.versionType=branch&api-version=7.1`;
  try {
    const response = await axios.get<string | { content?: string }>(url, {
      headers: { ...adoHeaders(repo.pat), Accept: 'application/json' },
      timeout: 20000,
    });
    if (typeof response.data === 'string') {
      return response.data;
    }
    return response.data.content ?? '';
  } catch {
    return '';
  }
}

async function azureChangedPaths(repo: AzureRepo, base: string, head: string): Promise<string[]> {
  const url = `https://dev.azure.com/${encodeURIComponent(repo.org)}/${encodeURIComponent(repo.project)}/_apis/git/repositories/${encodeURIComponent(repo.repository)}/diffs/commits?baseVersion=${encodeURIComponent(base)}&baseVersionType=branch&targetVersion=${encodeURIComponent(head)}&targetVersionType=branch&api-version=7.1`;
  const response = await axios.get<{ changes?: Array<{ item?: { path?: string } }> }>(url, {
    headers: adoHeaders(repo.pat),
    timeout: 30000,
  });
  return (response.data.changes ?? []).map((change) => change.item?.path ?? '').filter(Boolean);
}
