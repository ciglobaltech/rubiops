import { COMMANDS } from '../utils/constants';
import { formatPatScopesForUi, PAT_SETUP_STEPS } from '../utils/connectGuide';
import { escapeHtml } from '../utils/html';
import { basePanelStyles } from './panelStyles';

export function renderConnectGuideHtml(options?: {
  workspaceLabel?: string;
  showConnectButton?: boolean;
  compact?: boolean;
}): string {
  const workspaceLabel = escapeHtml(options?.workspaceLabel ?? 'this workspace');
  const steps = PAT_SETUP_STEPS.map(
    (step, index) => `<li><span class="step-num">${index + 1}</span>${escapeHtml(step)}</li>`
  ).join('');

  const connectBlock = options?.showConnectButton
    ? `<div class="actions">
        <button class="btn primary" onclick="connect()">Connect Azure DevOps</button>
        <button class="btn secondary" onclick="openPatHelp()">How to get PAT</button>
      </div>`
    : `<p class="hint">Run <strong>RubiOps: Connect Azure DevOps</strong> from the Command Palette or click Connect in the sidebar menu.</p>`;

  const folderNote =
    workspaceLabel === 'No workspace folder'
      ? `<div class="warn-box">
          <strong>Open a folder first.</strong>
          Use <em>File → Open Folder</em> and select your code repository. RubiOps saves the Azure DevOps connection per workspace folder.
        </div>`
      : `<p class="workspace-note">Workspace: <strong>${workspaceLabel}</strong> — connection is saved for this folder only.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${basePanelStyles()}
    ${connectGuideStyles(options?.compact)}
  </style>
</head>
<body>
  <div class="connect-page${options?.compact ? ' compact' : ''}">
    <header class="connect-header">
      <h1>Connect RubiOps</h1>
      <p class="lead">Link this editor to your Azure DevOps organization to view tasks, dashboard, and AI helpers.</p>
    </header>

    ${folderNote}

    <section class="card">
      <h2>What you need</h2>
      <ul class="need-list">
        <li><strong>Organization URL</strong> — e.g. <code>https://dev.azure.com/YourOrg</code></li>
        <li><strong>Personal Access Token (PAT)</strong> — from Azure DevOps user settings</li>
        <li><strong>Project name</strong> — e.g. <code>MyProject</code> (recommended)</li>
      </ul>
    </section>

    <section class="card">
      <h2>How to create a PAT</h2>
      <ol class="steps">${steps}</ol>
      <p class="scopes"><strong>Required scopes:</strong> ${escapeHtml(formatPatScopesForUi())}</p>
    </section>

    ${connectBlock}

    <p class="footer-hint">PAT is stored in VS Code Secret Storage (encrypted). It is only sent to your Azure DevOps organization.</p>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function connect() { vscode.postMessage({ type: 'connect' }); }
    function openPatHelp() { vscode.postMessage({ type: 'openPatHelp' }); }
  </script>
</body>
</html>`;
}

export function renderConnectBannerHtml(workspaceLabel?: string): string {
  return `<div class="connect-banner">
    <strong>Not connected.</strong> Open the Dashboard or run ${escapeHtml(COMMANDS.CONNECT)}.
    <button class="link-btn" onclick="connect()">Connect now</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function connect() { vscode.postMessage({ type: 'connect' }); }
  </script>`;
}

function connectGuideStyles(compact?: boolean): string {
  return `
    .connect-page { max-width: 720px; margin: 0 auto; padding: ${compact ? '16px' : '28px 32px'}; }
    .connect-header h1 { margin: 0 0 8px; font-size: ${compact ? '20px' : '26px'}; }
    .lead { color: var(--vscode-descriptionForeground); margin: 0 0 16px; line-height: 1.5; }
    .workspace-note { font-size: 12px; margin-bottom: 16px; color: var(--vscode-descriptionForeground); }
    .warn-box { background: #cca70022; border: 1px solid #cca70066; border-radius: 8px; padding: 12px 14px;
      margin-bottom: 16px; font-size: 13px; line-height: 1.5; }
    .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border);
      border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; }
    .card h2 { margin: 0 0 10px; font-size: 14px; }
    .need-list { margin: 0; padding-left: 18px; line-height: 1.6; font-size: 13px; }
    .need-list code { background: var(--vscode-textCodeBlock-background); padding: 1px 5px; border-radius: 4px; }
    .steps { margin: 0; padding: 0; list-style: none; }
    .steps li { display: flex; gap: 10px; margin-bottom: 10px; font-size: 13px; line-height: 1.45; }
    .step-num { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: inline-flex;
      align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .scopes { margin: 12px 0 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 16px; }
    .btn.primary { font-weight: 600; }
    .footer-hint, .hint { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
    .connect-banner { background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder); padding: 10px 12px; border-radius: 8px;
      font-size: 12px; margin-bottom: 12px; }
    .link-btn { margin-left: 8px; background: transparent; border: none; color: var(--vscode-textLink-foreground);
      cursor: pointer; text-decoration: underline; font-size: 12px; }
  `;
}
