import * as vscode from 'vscode';
import { WorkItem } from '../models/workItem';
import { formatCommitMessage } from '../utils/gitWorkItem';
import { applyTokenOptimizer, capText, contextCharLimits, readTokenBudget } from './tokenOptimizer';

export interface TaskAiPromptContext {
  workItem: WorkItem;
  workspaceFolder?: string;
  workspaceLabel?: string;
  projectName?: string;
  orgUrl?: string;
  webUrl?: string;
}

export async function buildWorkspaceCodeSummary(folder?: vscode.WorkspaceFolder): Promise<string> {
  if (!folder) {
    return 'No workspace folder is open. Open the project repository folder in VS Code/Cursor.';
  }

  try {
    const entries = await vscode.workspace.fs.readDirectory(folder.uri);
    const topLevel = entries
      .slice(0, 40)
      .map(([name, type]) => (type === vscode.FileType.Directory ? `${name}/` : name))
      .join(', ');

    const hints: string[] = [];
    const names = new Set(entries.map(([name]) => name.toLowerCase()));
    if (names.has('package.json')) hints.push('Node.js / npm project');
    if (names.has('tsconfig.json')) hints.push('TypeScript');
    if (names.has('pyproject.toml') || names.has('requirements.txt')) hints.push('Python');
    if (names.has('cargo.toml')) hints.push('Rust');
    if (names.has('go.mod')) hints.push('Go');
    if (names.has('pom.xml') || names.has('build.gradle')) hints.push('Java');
    if (names.has('.sln') || names.has('*.csproj')) hints.push('.NET');
    if (names.has('dockerfile') || names.has('docker-compose.yml')) hints.push('Docker');

    const stack = hints.length > 0 ? hints.join(', ') : 'Inspect package manifests in the repo root';

    return [
      `Workspace folder: ${folder.uri.fsPath}`,
      `Detected stack hints: ${stack}`,
      `Top-level entries: ${topLevel || '(empty)'}`,
    ].join('\n');
  } catch {
    return `Workspace folder: ${folder.uri.fsPath}`;
  }
}

export async function buildTaskImplementationPrompt(
  ctx: TaskAiPromptContext,
  options?: { charge?: boolean }
): Promise<string> {
  const { workItem } = ctx;
  const folder = vscode.workspace.workspaceFolders?.[0];
  const codeSummary = await buildWorkspaceCodeSummary(folder);
  const limits = contextCharLimits(readTokenBudget().nearLimit);
  const description = capText(stripHtml(workItem.description), limits.description);
  const acceptance = capText(stripHtml(workItem.acceptanceCriteria ?? ''), limits.acceptance);
  const branchSuggestion = slugifyBranch(workItem.id, workItem.title);
  const commitMessage = formatCommitMessage(workItem.id, workItem.title);

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

export async function buildAutoFixPrompt(
  ctx: TaskAiPromptContext & { evidence?: string }
): Promise<string> {
  const base = await buildTaskImplementationPrompt(ctx, { charge: false });
  const limits = contextCharLimits(readTokenBudget().nearLimit);
  const evidence = ctx.evidence ? capText(ctx.evidence, limits.evidence) : '';
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

async function finalizePrompt(prompt: string, modelHint: string): Promise<string> {
  const fitted = await applyTokenOptimizer(prompt, modelHint);
  if (fitted.exhausted) {
    throw new Error(fitted.text);
  }
  return fitted.text;
}

function stripHtml(html: string): string {
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

function slugifyBranch(id: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `feature/${id}-${slug || 'task'}`;
}
