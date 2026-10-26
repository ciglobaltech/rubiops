import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { COMMANDS } from '../utils/constants';
import { openPatHelpPage } from '../utils/connectGuide';
import { basePanelStyles } from './panelStyles';

export class NavigationViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'devopsQuickUpdate.navigation';
  private webviewView?: vscode.WebviewView;

  constructor(
    private readonly authService: AuthService,
    private readonly extensionContext?: vscode.ExtensionContext
  ) {}

  async refresh(): Promise<void> {
    if (this.webviewView) {
      await this.render(this.webviewView);
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getLoadingHtml();
    void this.render(webviewView);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.render(webviewView);
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'command' && typeof message.command === 'string') {
        if (message.command === COMMANDS.REFRESH) {
          const { runRefreshAll } = await import('../extensionState');
          await runRefreshAll();
          return;
        }
        await vscode.commands.executeCommand(message.command);
      }
      if (message.type === 'refresh') {
        const { runRefreshAll } = await import('../extensionState');
        await runRefreshAll();
      }
      if (message.type === 'connect') {
        await vscode.commands.executeCommand(COMMANDS.CONNECT);
      }
      if (message.type === 'openPatHelp') {
        await openPatHelpPage(this.authService.getOrganizationUrl());
      }
      if (message.type === 'connectProjectCode') {
        await vscode.commands.executeCommand(COMMANDS.CONNECT_PROJECT_CODE);
        await this.refresh();
      }
      if (message.type === 'switchRole' && typeof message.role === 'string') {
        if (this.extensionContext) {
          await this.extensionContext.globalState.update('rubiops.activeRole', message.role);
          await this.extensionContext.globalState.update('smartgenie.activeRole', message.role);
        }
        vscode.window.showInformationMessage(`RubiOps active role switched to: ${message.role}`);
        await this.refresh();
      }
    });
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); font-size: 12px;">
  Loading RubiOps…
</body>
</html>`;
  }

  private async render(webviewView: vscode.WebviewView): Promise<void> {
    const isConnected = await this.authService.isAuthenticated();

    const connectGuide = isConnected
      ? ''
      : `<section class="connect-steps">
          <h3>Quick Azure DevOps Connect</h3>
          <ol>
            <li>Organization URL: <code>https://dev.azure.com/YourOrg</code></li>
            <li>Create PAT in Azure DevOps (Scopes: Work Items, Project & Team)</li>
          </ol>
          <div class="connect-actions">
            <button class="secondary" onclick="connect()">Connect PAT</button>
            <button class="linkish" onclick="openPatHelp()">How to get PAT</button>
          </div>
        </section>`;

    const logoUri = this.extensionContext
      ? webviewView.webview.asWebviewUri(
          vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'icon.png')
        )
      : undefined;

    webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${basePanelStyles()}
    :root {
      --sg-card-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      --sg-border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.2)));
      --sg-hover-bg: var(--vscode-list-hoverBackground);
      --sg-surface-nested: rgba(128, 128, 128, 0.08);

      --sg-cyan: #0284c7;
      --sg-cyan-bg: rgba(2, 132, 199, 0.1);
      --sg-cyan-border: rgba(2, 132, 199, 0.4);

      --sg-green: #15803d;
      --sg-amber: #b45309;
      --sg-rose: #be123c;
      --sg-purple: #6d28d9;
    }
    body.vscode-dark, body.vscode-high-contrast {
      --sg-cyan: #38bdf8;
      --sg-cyan-bg: rgba(56, 189, 248, 0.14);
      --sg-cyan-border: rgba(56, 189, 248, 0.4);
      --sg-surface-nested: rgba(255, 255, 255, 0.06);

      --sg-green: #34d399;
      --sg-amber: #fbbf24;
      --sg-rose: #fb7185;
      --sg-purple: #c084fc;
    }
    .nav { padding: 12px; }
    .brand-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--sg-border);
    }
    .brand-title {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--vscode-foreground);
    }
    .brand-glow {
      color: var(--sg-cyan);
      font-weight: 700;
    }
    .status-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 999px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .project-card {
      background: var(--sg-card-bg);
      border: 1px solid var(--sg-border);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 14px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }
    .proj-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .proj-code {
      font-family: var(--vscode-editor-font-family);
      font-weight: 700;
      color: var(--sg-cyan);
      font-size: 11px;
      background: var(--sg-cyan-bg);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--sg-cyan-border);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .proj-code:hover {
      background: var(--sg-cyan);
      color: #ffffff;
    }
    .role-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      text-transform: uppercase;
      border: 1px solid currentColor;
    }
    .workspace-info {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nav-section {
      margin-bottom: 14px;
    }
    .section-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .action-btn {
      width: 100%;
      text-align: left;
      margin-bottom: 6px;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--sg-border);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      border-color: var(--vscode-focusBorder, var(--sg-cyan));
      transform: translateX(2px);
    }
    .action-btn.primary {
      background: linear-gradient(135deg, #0284c7, #6366f1);
      border: 1px solid rgba(2, 132, 199, 0.4);
      color: #ffffff;
      font-weight: 600;
    }
    .action-btn.primary:hover {
      filter: brightness(1.08);
      transform: translateX(2px);
    }
    .action-btn.ai-glow {
      background: var(--sg-card-bg);
      border: 1px solid var(--sg-cyan-border);
      color: var(--vscode-foreground);
      font-weight: 600;
    }
    .action-btn.ai-glow:hover {
      background: var(--sg-cyan-bg);
      border-color: var(--sg-cyan);
    }
    .role-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 8px;
    }
    .role-chip {
      background: var(--sg-card-bg);
      border: 1px solid var(--sg-border);
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-foreground);
      text-align: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .role-chip:hover {
      background: var(--sg-hover-bg);
      border-color: var(--vscode-focusBorder, var(--sg-cyan));
    }
    .role-chip.active {
      border-color: var(--sg-cyan);
      background: var(--sg-cyan-bg);
      color: var(--sg-cyan);
      font-weight: 700;
      box-shadow: 0 0 0 1px var(--sg-cyan-border);
    }
    .connect-steps {
      margin: 12px 0;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid var(--sg-border);
      background: var(--sg-card-bg);
      font-size: 11px;
      line-height: 1.45;
    }
    .connect-steps h3 { margin: 0 0 8px; font-size: 12px; }
    .connect-steps ol { margin: 0 0 10px; padding-left: 18px; }
    .connect-steps code { font-size: 10px; }
    .connect-actions { display: flex; gap: 8px; align-items: center; }
    button.linkish {
      background: transparent;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: underline;
      font-size: 11px;
      padding: 0;
      width: auto;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="nav">
    <!-- Brand Header -->
    <div class="brand-header">
      <div class="brand-title">
        ${logoUri ? `<img src="${logoUri}" alt="RubiOps" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:6px;" />` : '<span>⚡</span>'}<span class="brand-glow">RubiOps</span>
      </div>
      <button class="linkish" style="font-size: 11px;" onclick="refreshAll()">🔄 Refresh</button>
    </div>

    <div class="nav-section">
      <button class="action-btn primary" onclick="run('${COMMANDS.OPEN_AGENT}')">
        <span>✦</span> Agent
      </button>
      <button class="action-btn" onclick="run('${COMMANDS.OPEN_GUIDE}')">
        <span>📘</span> How to use
      </button>
      <button class="action-btn" onclick="run('${COMMANDS.CODE_REVIEW}')">
        <span>🔍</span> Code Review
      </button>
      <button class="action-btn" onclick="run('${COMMANDS.MERGE_REVIEW}')">
        <span>🔀</span> Merge Review
      </button>
      <button class="action-btn ai-glow" onclick="run('${COMMANDS.OPEN_REFACTOR_PREVIEW}')">
        <span>⚡</span> Refactor Preview (Flutter Fixes)
      </button>
    </div>



    <!-- SECTION 2: Agile Cockpit & Workboard -->
    <div class="nav-section">
      <div class="section-label">📊 Agile Cockpit & Tasks</div>
      <button class="action-btn primary" onclick="run('${COMMANDS.OPEN_DASHBOARD}')">
        <span>📊</span> Open Cockpit Dashboard
      </button>
      <button class="action-btn" onclick="run('${COMMANDS.OPEN_TASKS}')">
        <span>📋</span> My Work Items (Panel)
      </button>
      <button class="action-btn" onclick="run('${COMMANDS.COPY_STANDUP}')">
        <span>🤖</span> AI Standup Summary
      </button>
      <button class="action-btn" onclick="run('${COMMANDS.OPEN_RECOMMENDED}')">
        <span>⚡</span> AI: Open Next Task
      </button>
      <button class="action-btn" onclick="run('${COMMANDS.COPY_COMMIT_MESSAGE}')">
        <span>💬</span> Copy Conventional Commit
      </button>
    </div>

    ${connectGuide}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function run(command) { vscode.postMessage({ type: 'command', command }); }
    function connect() { vscode.postMessage({ type: 'connect' }); }
    function openPatHelp() { vscode.postMessage({ type: 'openPatHelp' }); }
    function refreshAll() { vscode.postMessage({ type: 'refresh' }); }
  </script>
</body>
</html>`;
  }
}
