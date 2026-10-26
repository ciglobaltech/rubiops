import * as vscode from 'vscode';
import { WorkItemEditContext } from '../models/projectMember';
import { WorkItemService } from '../services/workItemService';
import { AuthService } from '../auth/authService';
import { escapeHtml } from '../utils/html';
import { getStatusDisplay } from '../utils/workItemStatus';
import { COMMANDS } from '../utils/constants';
import { formatCommitMessage } from '../utils/gitWorkItem';
import { copyAiPrompt, copyOrOpenAiPrompt } from '../services/aiAgentLauncher';

export type OnWorkItemUpdated = () => Promise<void>;

export class WorkItemDetailsPanel {
  private panel?: vscode.WebviewPanel;

  constructor(
    private readonly workItemService: WorkItemService,
    private readonly authService: AuthService,
    private readonly onUpdated?: OnWorkItemUpdated
  ) {}

  async show(workItemId: number): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'workItemDetails',
        `Work Item #${workItemId}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage(async (message) => {
        await this.handleMessage(message);
      });
    }

    await this.render(workItemId);
  }

  private async handleMessage(message: {
    type: string;
    id?: number;
    state?: string;
    description?: string;
    assignedTo?: string;
    comment?: string;
  }): Promise<void> {
    if (message.type === 'openInAdo' && typeof message.id === 'number') {
      await this.workItemService.openInBrowser(message.id);
    }
    if (message.type === 'refresh' && typeof message.id === 'number') {
      await this.render(message.id);
    }
    if (message.type === 'copyCommit' && typeof message.id === 'number') {
      await vscode.commands.executeCommand(COMMANDS.COPY_COMMIT_MESSAGE, message.id);
    }
    if (message.type === 'copyAiPrompt' && typeof message.id === 'number') {
      try {
        const prompt = await this.workItemService.getTaskImplementationPrompt(message.id);
        await copyAiPrompt(prompt);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Failed to build AI prompt';
        vscode.window.showErrorMessage(errMsg);
      }
    }
    if (message.type === 'openAiAgent' && typeof message.id === 'number') {
      try {
        const prompt = await this.workItemService.getTaskImplementationPrompt(message.id);
        await copyOrOpenAiPrompt(prompt);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Failed to open AI agent';
        vscode.window.showErrorMessage(errMsg);
      }
    }
    if (message.type === 'autoCodeFix' && typeof message.id === 'number') {
      await vscode.commands.executeCommand(COMMANDS.AUTO_CODE_FIX, message.id);
    }
    if (message.type === 'saveChanges' && typeof message.id === 'number') {

      try {
        const saveResult = await this.workItemService.saveWorkItemChanges(message.id!, {
          state: message.state,
          description: message.description,
          assignedToUniqueName:
            message.assignedTo === '__unassigned__' ? null : message.assignedTo,
          comment: message.comment,
        });

        if (saveResult.stateChanged && saveResult.newState) {
          await this.workItemService.promptBranchAfterStateChange(
            saveResult.workItem,
            saveResult.newState
          );
        }

        vscode.window.showInformationMessage(`Work item #${message.id} saved.`);
        await this.render(message.id);
        await this.onUpdated?.();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Save failed';
        vscode.window.showErrorMessage(errMsg);
      }
    }
    if (
      message.type === 'changeState' &&
      typeof message.id === 'number' &&
      typeof message.state === 'string'
    ) {
      try {
        const saveResult = await this.workItemService.saveWorkItemChanges(message.id, {
          state: message.state,
        });
        if (saveResult.stateChanged && saveResult.newState) {
          await this.workItemService.promptBranchAfterStateChange(
            saveResult.workItem,
            saveResult.newState
          );
        }
        await this.render(message.id);
        await this.onUpdated?.();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Update failed';
        vscode.window.showErrorMessage(errMsg);
      }
    }
  }

  private async render(workItemId: number): Promise<void> {
    if (!this.panel) {
      return;
    }

    this.panel.title = `Loading #${workItemId}...`;
    this.panel.webview.html = this.getLoadingHtml(workItemId);

    try {
      const ctx = await this.workItemService.getWorkItemEditContext(workItemId);
      const webUrl = await this.workItemService.getWorkItemWebUrl(workItemId);
      const workspaceLabel = this.authService.getWorkspaceLabel();
      const orgUrl = this.authService.getOrganizationUrl() ?? '';
      const projectName = this.authService.getProjectName() ?? ctx.workItem.project;
      const statusDisplay = getStatusDisplay(
        ctx.workItem.state,
        ctx.workItem.stateCategory ?? 'Unknown',
        ctx.workItem.assignedTo,
        ctx.currentUser
      );

      this.panel.title = `${ctx.workItem.id} — ${ctx.workItem.title}`;
      this.panel.webview.html = this.getDetailsHtml(ctx, webUrl, statusDisplay, {
        workspaceLabel,
        orgUrl,
        projectName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load work item';
      this.panel.title = `Work Item #${workItemId}`;
      this.panel.webview.html = this.getErrorHtml(message);
    }
  }

  private getLoadingHtml(workItemId: number): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${this.baseStyles()}</style></head>
<body><div class="center">Loading work item #${workItemId}...</div></body></html>`;
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${this.baseStyles()}</style></head>
<body><div class="center">${escapeHtml(message)}</div></body></html>`;
  }

  private getDetailsHtml(
    ctx: WorkItemEditContext,
    webUrl: string,
    statusDisplay: ReturnType<typeof getStatusDisplay>,
    workspace: { workspaceLabel: string; orgUrl: string; projectName: string }
  ): string {
    const { workItem, validStates, allOrgStates, members, comments } = ctx;
    const plainDescription = stripHtml(workItem.description);
    const plainAcceptance = stripHtml(workItem.acceptanceCriteria ?? '');
    const tags = workItem.tags.length > 0 ? workItem.tags.join(', ') : 'None';
    const commitMessage = formatCommitMessage(workItem.id, workItem.title);

    const stateOptions = [
      `<option value="${escapeHtml(workItem.state)}" selected>${escapeHtml(workItem.state)} — ${escapeHtml(workItem.stateCategory ?? '')} (current)</option>`,
      ...validStates.map(
        (state) =>
          `<option value="${escapeHtml(state.name)}">${escapeHtml(state.name)} — ${escapeHtml(state.category)}</option>`
      ),
    ].join('');

    const assigneeOptions = [
      `<option value="__unassigned__" ${workItem.assignedTo === 'Unassigned' ? 'selected' : ''}>Unassigned</option>`,
      ...members.map((member) => {
        const selected =
          member.uniqueName === workItem.assignedToUniqueName ||
          member.displayName === workItem.assignedTo
            ? 'selected'
            : '';
        return `<option value="${escapeHtml(member.uniqueName)}" ${selected}>${escapeHtml(member.displayName)}</option>`;
      }),
    ].join('');

    const orgStatesList = allOrgStates
      .map((s) => `<span class="org-state">${escapeHtml(s.name)} <em>(${escapeHtml(s.category)})</em></span>`)
      .join('');

    const parentLine = workItem.parentId
      ? `${escapeHtml(workItem.parentType ?? 'Item')} #${workItem.parentId} — ${escapeHtml(workItem.parentTitle ?? '')} (${escapeHtml(workItem.parentState ?? '')})`
      : 'None';

    const discussionsHtml =
      comments.length === 0
        ? '<div class="empty-discussion">No discussions yet</div>'
        : `<div class="discussion-list">${comments
            .map(
              (comment) => `
          <article class="discussion-item">
            <div class="discussion-meta">
              <strong>${escapeHtml(comment.createdBy)}</strong>
              <span>${escapeHtml(formatDate(comment.createdDate))}</span>
            </div>
            <div class="discussion-text">${escapeHtml(comment.text)}</div>
          </article>`
            )
            .join('')}</div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${this.baseStyles()}${this.detailStyles()}</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn ai" onclick="openAiAgent()">Open in AI Agent</button>
    <button class="btn ai" onclick="autoCodeFix()">Auto Code Fix</button>
    <button class="btn secondary" onclick="copyAiPrompt()">Copy AI Prompt</button>
    <button class="btn" onclick="openInAdo()">Open in Azure DevOps</button>

    <button class="btn secondary" onclick="refresh()">Refresh</button>
    <button class="btn secondary" onclick="copyCommit()">Copy AB# Commit</button>
    <button class="btn primary" onclick="saveChanges()">Save Changes</button>
  </div>
  <div class="ai-hint-box">
    <strong>Open in AI Agent</strong> copies a prompt into Cursor chat.
    <strong>Auto Code Fix</strong> runs Cursor SDK unattended, then commits and pushes (needs Cursor API key + ADO Code write PAT). Open the <em>target app repo</em> as your workspace folder first.
  </div>
  <div class="commit-hint">Commit: <code>${escapeHtml(commitMessage)}</code></div>
  <div class="ado-url">${escapeHtml(webUrl)}</div>

  <div class="workspace-box">
    <div class="workspace-label">Workspace: ${escapeHtml(workspace.workspaceLabel)}</div>
    <div class="workspace-meta">${escapeHtml(workspace.orgUrl)} · ${escapeHtml(workspace.projectName)}</div>
  </div>

  <h1>${escapeHtml(workItem.title)}</h1>

  <div class="status-hero ${statusDisplay.cssClass}">
    <div class="status-main">
      <span class="status-kicker">Current Status</span>
      <span class="status-name">${escapeHtml(statusDisplay.label)}</span>
      <span class="status-category">${escapeHtml(workItem.stateCategory ?? '')}</span>
    </div>
    <p class="status-hint">${escapeHtml(statusDisplay.hint)}</p>
  </div>

  <section class="edit-box">
    <h2>Edit Work Item</h2>
    <p class="hint">Status, assignee, and members are loaded from your Azure DevOps org settings.</p>

    <label class="label" for="assigneeSelect">Assigned To</label>
    <select id="assigneeSelect">${assigneeOptions}</select>

    <label class="label" for="stateSelect">State</label>
    <select id="stateSelect">${stateOptions}</select>
    <p class="field-hint">Changing state will prompt you to log hours to Azure DevOps Completed Work.</p>
    <div class="org-states">Org states for ${escapeHtml(workItem.workItemType)}: ${orgStatesList}</div>

    <label class="label" for="descriptionInput">Description</label>
    <textarea id="descriptionInput" rows="8" placeholder="Enter or update description...">${escapeHtml(plainDescription)}</textarea>

    <label class="label">Acceptance Criteria (from Azure DevOps)</label>
    <div class="readonly-box">${plainAcceptance ? escapeHtml(plainAcceptance) : 'No acceptance criteria on this work item type.'}</div>

    <label class="label" for="commentInput">Add Discussion Comment</label>
    <textarea id="commentInput" rows="4" placeholder="Add a new comment to discussions..."></textarea>
  </section>

  <div class="grid">
    <div class="field"><span class="label">ID</span><span>${workItem.id}</span></div>
    <div class="field"><span class="label">Type</span><span>${escapeHtml(workItem.workItemType)}</span></div>
    <div class="field"><span class="label">Project</span><span>${escapeHtml(workItem.project)}</span></div>
    <div class="field"><span class="label">Priority</span><span>${escapeHtml(String(workItem.priority))}</span></div>
    <div class="field"><span class="label">Due Date</span><span>${workItem.dueDate ? escapeHtml(formatDate(workItem.dueDate)) : 'Not set'}</span></div>
    <div class="field"><span class="label">Completed Work</span><span>${workItem.completedWork != null ? `${workItem.completedWork}h` : 'Not logged'}</span></div>
    <div class="field"><span class="label">Remaining Work</span><span>${workItem.remainingWork != null ? `${workItem.remainingWork}h` : 'Not set'}</span></div>
    <div class="field"><span class="label">Created</span><span>${escapeHtml(formatDate(workItem.createdDate))}</span></div>
    <div class="field"><span class="label">Last Changed</span><span>${escapeHtml(formatDate(workItem.changedDate))}</span></div>
    <div class="field"><span class="label">Area Path</span><span>${escapeHtml(workItem.areaPath)}</span></div>
    <div class="field"><span class="label">Iteration</span><span>${escapeHtml(workItem.iterationPath)}</span></div>
    <div class="field"><span class="label">Tags</span><span>${escapeHtml(tags)}</span></div>
    <div class="field"><span class="label">Parent</span><span>${parentLine}</span></div>
  </div>

  <h2>Discussions <span class="count">(${comments.length})</span></h2>
  ${discussionsHtml}

  <script>
    const vscode = acquireVsCodeApi();
    const workItemId = ${workItem.id};
    const originalState = ${JSON.stringify(workItem.state)};
    const originalDescription = ${JSON.stringify(plainDescription)};
    const originalAssignee = ${JSON.stringify(
      workItem.assignedToUniqueName ??
        (workItem.assignedTo === 'Unassigned' ? '__unassigned__' : workItem.assignedTo)
    )};

    function openInAdo() { vscode.postMessage({ type: 'openInAdo', id: workItemId }); }
    function refresh() { vscode.postMessage({ type: 'refresh', id: workItemId }); }
    function copyCommit() { vscode.postMessage({ type: 'copyCommit', id: workItemId }); }
    function copyAiPrompt() { vscode.postMessage({ type: 'copyAiPrompt', id: workItemId }); }
    function openAiAgent() { vscode.postMessage({ type: 'openAiAgent', id: workItemId }); }
    function autoCodeFix() { vscode.postMessage({ type: 'autoCodeFix', id: workItemId }); }


    function saveChanges() {
      const state = document.getElementById('stateSelect').value;
      const description = document.getElementById('descriptionInput').value;
      const assignedTo = document.getElementById('assigneeSelect').value;
      const comment = document.getElementById('commentInput').value.trim();

      const payload = { type: 'saveChanges', id: workItemId };
      if (state !== originalState) payload.state = state;
      if (description !== originalDescription) payload.description = description;
      if (assignedTo !== originalAssignee) payload.assignedTo = assignedTo;
      if (comment) payload.comment = comment;

      if (!payload.state && payload.description === undefined && payload.assignedTo === undefined && !payload.comment) {
        return;
      }
      vscode.postMessage(payload);
    }
  </script>
</body>
</html>`;
  }

  private baseStyles(): string {
    return `
      body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
        background: var(--vscode-editor-background); padding: 16px 20px; line-height: 1.5; }
      .center { text-align: center; padding: 48px 24px; }
    `;
  }

  private detailStyles(): string {
    return `
      h1 { font-size: 1.3em; margin: 12px 0; }
      h2 { font-size: 1em; margin: 20px 0 8px; color: var(--vscode-descriptionForeground); }
      h2 .count { font-weight:400; font-size:12px; }
      .toolbar { display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
      .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground);
        border:none; padding:8px 14px; border-radius:4px; cursor:pointer; font-size:13px; }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .btn.secondary { background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground); }
      .btn.primary { font-weight:600; }
      .btn.ai { background:#7c3aed; color:#fff; font-weight:600; }
      .btn.ai:hover { filter:brightness(1.08); }
      .ai-hint-box { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:12px;
        padding:8px 10px; border-radius:6px; background:var(--vscode-textBlockQuote-background); line-height:1.45; }
      .readonly-box { white-space:pre-wrap; font-size:13px; line-height:1.5; margin-top:6px; margin-bottom:4px;
        padding:10px 12px; border-radius:6px; border:1px solid var(--vscode-panel-border);
        background:var(--vscode-editor-background); color:var(--vscode-foreground); min-height:48px; }
      .ado-url { font-size:12px; color:var(--vscode-descriptionForeground); margin-bottom:12px; word-break:break-all; }
      .commit-hint { font-size:12px; color:var(--vscode-descriptionForeground); margin-bottom:12px; }
      .commit-hint code { background:var(--vscode-textCodeBlock-background); padding:2px 6px; border-radius:4px; }
      .workspace-box { background:var(--vscode-sideBar-background); border:1px solid var(--vscode-panel-border);
        border-radius:8px; padding:10px 14px; margin-bottom:14px; }
      .workspace-label { font-weight:600; font-size:13px; }
      .workspace-meta { font-size:12px; color:var(--vscode-descriptionForeground); margin-top:4px; }
      .status-hero { border-radius:12px; padding:16px 18px; margin-bottom:16px; border:1px solid var(--vscode-panel-border); }
      .status-kicker { display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.04em;
        color:var(--vscode-descriptionForeground); margin-bottom:6px; }
      .status-name { display:block; font-size:24px; font-weight:700; line-height:1.2; }
      .status-category { display:inline-block; margin-top:6px; font-size:12px; padding:2px 8px;
        border-radius:10px; background:var(--vscode-badge-background); }
      .status-hint { margin:10px 0 0; font-size:13px; }
      .status-action-needed { background:#3794ff18; border-color:#3794ff55; }
      .status-action-needed .status-name { color:#3794ff; }
      .status-in-progress { background:#3794ff18; border-color:#3794ff55; }
      .status-in-progress .status-name { color:#3794ff; }
      .status-on-hold { background:#dcdcaa22; border-color:#dcdcaa66; }
      .status-on-hold .status-name { color:#dcdcaa; }
      .status-blocked { background:#c586c022; border-color:#c586c066; }
      .status-blocked .status-name { color:#c586c0; }
      .status-resolved { background:#4ec9b018; border-color:#4ec9b055; }
      .status-resolved .status-name { color:#4ec9b0; }
      .status-not-assigned { background:#88888818; border-color:#88888855; }
      .status-not-assigned .status-name { color:var(--vscode-descriptionForeground); }
      .edit-box { background:var(--vscode-sideBar-background); border:1px solid var(--vscode-panel-border);
        border-radius:10px; padding:16px; margin-bottom:16px; }
      .edit-box h2 { margin-top:0; }
      .edit-box .label { margin-top:12px; }
      select, textarea { width:100%; margin-top:6px; background:var(--vscode-input-background);
        color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border);
        padding:8px; border-radius:4px; font-size:13px; font-family:var(--vscode-font-family); }
      textarea { resize:vertical; min-height:80px; }
      .org-states { margin-top:8px; font-size:11px; color:var(--vscode-descriptionForeground); line-height:1.6; }
      .field-hint { font-size:11px; color:var(--vscode-descriptionForeground); margin:4px 0 8px; }
      .org-state { display:inline-block; margin:0 8px 4px 0; }
      .org-state em { font-style:normal; opacity:0.8; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 20px; margin-bottom:16px; }
      .field { font-size:13px; }
      .label { display:block; font-weight:600; font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:2px; }
      .hint { font-size:11px; color:var(--vscode-descriptionForeground); margin:4px 0 0; }
      .discussion-list { display:flex; flex-direction:column; gap:10px; }
      .discussion-item { background:var(--vscode-sideBar-background); border:1px solid var(--vscode-panel-border);
        border-radius:8px; padding:12px; }
      .discussion-meta { display:flex; justify-content:space-between; gap:12px; font-size:12px;
        color:var(--vscode-descriptionForeground); margin-bottom:8px; }
      .discussion-text { white-space:pre-wrap; font-size:13px; }
      .empty-discussion { font-size:12px; color:var(--vscode-descriptionForeground); font-style:italic; }
    `;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
