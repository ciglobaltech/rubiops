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
exports.TaskBotPanel = void 0;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../utils/constants");
const html_1 = require("../utils/html");
const panelStyles_1 = require("./panelStyles");
class TaskBotPanel {
    workItemService;
    authService;
    selectionService;
    static viewType = 'devopsQuickUpdate.taskBot';
    panel;
    messages = [];
    searching = false;
    constructor(workItemService, authService, selectionService) {
        this.workItemService = workItemService;
        this.authService = authService;
        this.selectionService = selectionService;
    }
    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.render();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(TaskBotPanel.viewType, 'Task Search Bot', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        if (this.messages.length === 0) {
            this.messages.push({
                role: 'bot',
                text: 'Hi! I search your Azure DevOps backlog and tasks. Try: "printer integration on backlog" or "payment API assigned to me".',
                timestamp: new Date().toISOString(),
            });
        }
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'search' && typeof message.query === 'string') {
                await this.handleSearch(message.query);
            }
            if (message.type === 'open' && typeof message.id === 'number') {
                const title = typeof message.title === 'string' ? message.title : `#${message.id}`;
                this.selectionService.select(message.id, title);
                await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_WORK_ITEM, message.id, title);
            }
            if (message.type === 'example' && typeof message.query === 'string') {
                await this.handleSearch(message.query);
            }
        });
        this.render();
    }
    async refresh() {
        if (this.panel) {
            this.render();
        }
    }
    async handleSearch(query) {
        const trimmed = query.trim();
        if (!trimmed || !this.panel || this.searching) {
            return;
        }
        if (!(await this.authService.isAuthenticated())) {
            this.messages.push({
                role: 'bot',
                text: 'Connect to Azure DevOps first, then ask me about your tasks.',
                timestamp: new Date().toISOString(),
            });
            this.render();
            return;
        }
        this.searching = true;
        this.messages.push({
            role: 'user',
            text: trimmed,
            timestamp: new Date().toISOString(),
        });
        this.messages.push({
            role: 'bot',
            text: 'Searching your work items…',
            timestamp: new Date().toISOString(),
        });
        this.render();
        try {
            const result = await this.workItemService.searchWithTaskBot(trimmed);
            this.messages.pop();
            this.messages.push({
                role: 'bot',
                text: result.reply,
                items: result.items,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            this.messages.pop();
            const message = error instanceof Error ? error.message : 'Search failed';
            this.messages.push({
                role: 'bot',
                text: `Sorry, I could not search: ${message}`,
                timestamp: new Date().toISOString(),
            });
        }
        finally {
            this.searching = false;
            this.render();
        }
    }
    render() {
        if (!this.panel) {
            return;
        }
        const workspaceLabel = (0, html_1.escapeHtml)(this.authService.getWorkspaceLabel());
        const projectName = (0, html_1.escapeHtml)(this.authService.getProjectName() ?? 'default project');
        this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${(0, panelStyles_1.basePanelStyles)()}
    ${this.getBotStyles()}
  </style>
</head>
<body>
  <div class="page bot-page">
    <header class="bot-header">
      <div>
        <h1>⚡ Task Search Bot</h1>
        <p class="subtitle">RubiOps — natural language search across backlog &amp; tasks · ${workspaceLabel} · ${projectName}</p>
      </div>
    </header>

    <div class="examples">
      <span class="examples-label">Try:</span>
      <button class="chip" onclick="runExample('printer integration on backlog')">printer integration on backlog</button>
      <button class="chip" onclick="runExample('payment API backlog')">payment API backlog</button>
      <button class="chip" onclick="runExample('my blocked tasks')">my blocked tasks</button>
    </div>

    <div class="chat" id="chat">${this.renderMessages()}</div>

    <form class="composer" onsubmit="submitSearch(event)">
      <input
        id="queryInput"
        type="text"
        placeholder='Ask anything… e.g. "printer integration task on backlog"'
        autocomplete="off"
        ${this.searching ? 'disabled' : ''}
      />
      <button type="submit" ${this.searching ? 'disabled' : ''}>Search</button>
    </form>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    chat.scrollTop = chat.scrollHeight;

    function submitSearch(event) {
      event.preventDefault();
      const input = document.getElementById('queryInput');
      const query = input.value.trim();
      if (!query) return;
      vscode.postMessage({ type: 'search', query });
      input.value = '';
    }

    function runExample(query) {
      vscode.postMessage({ type: 'example', query });
    }

    function openItem(id) {
      vscode.postMessage({ type: 'open', id });
    }
  </script>
</body>
</html>`;
    }
    renderMessages() {
        return this.messages
            .map((message) => {
            const roleClass = message.role === 'user' ? 'msg-user' : 'msg-bot';
            const label = message.role === 'user' ? 'You' : 'RubiOps Bot';
            const itemsHtml = message.items && message.items.length > 0
                ? `<div class="results">${message.items.map((item) => this.renderResultCard(item)).join('')}</div>`
                : '';
            return `<div class="msg ${roleClass}">
          <div class="msg-label">${label}</div>
          <div class="msg-text">${(0, html_1.escapeHtml)(message.text)}</div>
          ${itemsHtml}
        </div>`;
        })
            .join('');
    }
    renderResultCard(item) {
        const due = item.dueDate ? ` · due ${(0, html_1.escapeHtml)(item.dueDate.slice(0, 10))}` : '';
        const preview = item.descriptionPreview
            ? `<p class="result-preview">${(0, html_1.escapeHtml)(item.descriptionPreview)}</p>`
            : '';
        const match = item.matchReason
            ? `<span class="result-match">${(0, html_1.escapeHtml)(item.matchReason)}</span>`
            : '';
        return `<button class="result-card" onclick="openItem(${item.id})">
      <div class="result-top">
        <strong>#${item.id}</strong>
        <span class="result-type">${(0, html_1.escapeHtml)(item.workItemType)}</span>
        <span class="result-state">${(0, html_1.escapeHtml)(item.state)}</span>
        ${match}
      </div>
      <div class="result-title">${(0, html_1.escapeHtml)(item.title)}</div>
      <div class="result-meta">${(0, html_1.escapeHtml)(item.project)}${due}</div>
      ${preview}
    </button>`;
    }
    getBotStyles() {
        return `
      .bot-page { display:flex; flex-direction:column; min-height:100vh; padding-bottom:16px; }
      .bot-header { margin-bottom:12px; }
      .subtitle { color:var(--vscode-descriptionForeground); font-size:12px; margin:4px 0 0; }
      .examples { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:16px; }
      .examples-label { font-size:12px; color:var(--vscode-descriptionForeground); }
      .chip {
        background:var(--vscode-badge-background);
        color:var(--vscode-badge-foreground);
        border:none;
        border-radius:999px;
        padding:4px 10px;
        font-size:11px;
        cursor:pointer;
      }
      .chip:hover { opacity:0.9; }
      .chat {
        flex:1;
        min-height:360px;
        max-height:calc(100vh - 220px);
        overflow:auto;
        border:1px solid var(--vscode-panel-border);
        border-radius:8px;
        padding:12px;
        background:var(--vscode-sideBar-background);
        margin-bottom:12px;
      }
      .msg { margin-bottom:14px; }
      .msg-label { font-size:11px; font-weight:600; margin-bottom:4px; color:var(--vscode-descriptionForeground); }
      .msg-user .msg-text {
        display:inline-block;
        background:var(--vscode-input-background);
        border:1px solid var(--vscode-input-border);
        border-radius:12px 12px 12px 4px;
        padding:8px 12px;
        max-width:85%;
      }
      .msg-bot .msg-text {
        background:var(--vscode-editor-background);
        border:1px solid var(--vscode-panel-border);
        border-radius:12px 12px 12px 4px;
        padding:8px 12px;
      }
      .results { display:flex; flex-direction:column; gap:8px; margin-top:10px; }
      .result-card {
        text-align:left;
        width:100%;
        background:var(--vscode-editor-background);
        border:1px solid var(--vscode-panel-border);
        border-radius:8px;
        padding:10px 12px;
        cursor:pointer;
      }
      .result-card:hover { border-color:var(--vscode-focusBorder); }
      .result-top { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:11px; margin-bottom:4px; }
      .result-type, .result-state, .result-match {
        background:var(--vscode-badge-background);
        color:var(--vscode-badge-foreground);
        border-radius:4px;
        padding:1px 6px;
      }
      .result-title { font-size:13px; font-weight:600; margin-bottom:4px; }
      .result-meta { font-size:11px; color:var(--vscode-descriptionForeground); }
      .result-preview { font-size:11px; color:var(--vscode-descriptionForeground); margin:6px 0 0; line-height:1.4; }
      .composer {
        display:flex;
        gap:8px;
        position:sticky;
        bottom:0;
        background:var(--vscode-editor-background);
        padding-top:4px;
      }
      .composer input {
        flex:1;
        background:var(--vscode-input-background);
        color:var(--vscode-input-foreground);
        border:1px solid var(--vscode-input-border);
        border-radius:6px;
        padding:10px 12px;
        font-size:13px;
      }
      .composer button { min-width:88px; }
    `;
    }
}
exports.TaskBotPanel = TaskBotPanel;
//# sourceMappingURL=taskBotPanel.js.map