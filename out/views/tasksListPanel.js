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
exports.TasksListPanel = void 0;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../utils/constants");
const html_1 = require("../utils/html");
const panelStyles_1 = require("./panelStyles");
const connectGuideHtml_1 = require("./connectGuideHtml");
const connectGuide_1 = require("../utils/connectGuide");
class TasksListPanel {
    workItemService;
    authService;
    selectionService;
    static viewType = 'devopsQuickUpdate.tasksList';
    panel;
    cachedItems = [];
    constructor(workItemService, authService, selectionService) {
        this.workItemService = workItemService;
        this.authService = authService;
        this.selectionService = selectionService;
    }
    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            await this.refresh();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(TasksListPanel.viewType, 'My Tasks', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'select' && typeof message.id === 'number') {
                const item = this.cachedItems.find((entry) => entry.id === message.id);
                this.selectionService.select(message.id, item?.title ?? `#${message.id}`);
                this.updateHtml();
            }
            if (message.type === 'open' && typeof message.id === 'number') {
                const item = this.cachedItems.find((entry) => entry.id === message.id);
                if (item) {
                    this.selectionService.select(item.id, item.title);
                }
                await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_WORK_ITEM, message.id);
            }
            if (message.type === 'refresh') {
                await this.refresh();
            }
            if (message.type === 'connect') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.CONNECT);
            }
            if (message.type === 'openPatHelp') {
                await (0, connectGuide_1.openPatHelpPage)(this.authService.getOrganizationUrl());
            }
        });
        await this.refresh();
    }
    async refresh() {
        if (!this.panel) {
            return;
        }
        if (!(await this.authService.isAuthenticated())) {
            this.panel.webview.html = (0, connectGuideHtml_1.renderConnectGuideHtml)({
                workspaceLabel: this.authService.getWorkspaceLabel(),
                showConnectButton: true,
                compact: true,
            });
            return;
        }
        try {
            this.panel.webview.html = this.getLoadingHtml();
            this.cachedItems = await this.workItemService.getTaskListItems(true);
            this.updateHtml();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load tasks';
            this.panel.webview.html = this.getErrorHtml(message);
        }
    }
    updateHtml() {
        if (!this.panel) {
            return;
        }
        const selected = this.selectionService.getSelected();
        this.panel.webview.html = this.getHtml(this.cachedItems, selected?.id);
    }
    getHtml(items, selectedId) {
        const selected = this.selectionService.getSelected();
        const listHtml = items.length === 0
            ? '<div class="empty">No active tasks assigned to you.</div>'
            : `<ul class="task-list">${items
                .map((item) => {
                const isSelected = item.id === selectedId;
                const due = item.dueDate ? ` · Due ${formatDate(item.dueDate)}` : '';
                const sprint = item.iterationPath
                    ? ` · ${(0, html_1.escapeHtml)(item.iterationPath.split('\\').pop() ?? item.iterationPath)}`
                    : '';
                return `
              <li class="task-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                <div class="task-row">
                  <div class="task-content">
                    <div class="task-title">#${item.id} ${(0, html_1.escapeHtml)(item.title)}</div>
                    <div class="task-meta">${(0, html_1.escapeHtml)(item.workItemType)} · ${(0, html_1.escapeHtml)(item.state)}${sprint}${due}</div>
                  </div>
                  <button class="open-btn" data-open="${item.id}">Open</button>
                </div>
              </li>`;
            })
                .join('')}</ul>`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${(0, panelStyles_1.basePanelStyles)()}
    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
    .subtitle { color: var(--vscode-descriptionForeground); font-size:13px; margin-top:6px; }
    .hint { font-size:12px; color:var(--vscode-descriptionForeground); margin-bottom:16px; }
    .selected-box {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }
    .task-list { max-height: calc(100vh - 220px); overflow-y: auto; }
    .task-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .task-content { flex:1; min-width:0; }
    .open-btn {
      flex-shrink: 0;
      padding: 6px 12px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <h1>My Tasks</h1>
        <p class="subtitle">${items.length} active task(s) assigned to you</p>
      </div>
      <button onclick="refresh()">Refresh</button>
    </div>
    <div class="selected-box">
      <strong>Selected for dashboard actions:</strong>
      ${selected ? `#${selected.id} ${(0, html_1.escapeHtml)(selected.title)}` : 'Click a task to select, or click Open for details'}
    </div>
    <p class="hint">Single-click to select · Click Open or double-click row for details on the right</p>
    ${listHtml}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let clickTimer = null;

    document.querySelectorAll('.task-item').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('.open-btn')) return;
        const id = Number(row.dataset.id);
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          vscode.postMessage({ type: 'select', id });
          clickTimer = null;
        }, 220);
      });
      row.addEventListener('dblclick', (event) => {
        if (event.target.closest('.open-btn')) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        vscode.postMessage({ type: 'open', id: Number(row.dataset.id) });
      });
    });

    document.querySelectorAll('.open-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        vscode.postMessage({ type: 'open', id: Number(btn.dataset.open) });
      });
    });

    function refresh() { vscode.postMessage({ type: 'refresh' }); }
  </script>
</body>
</html>`;
    }
    getLoadingHtml() {
        return `<!DOCTYPE html><html><body><div class="center">Loading tasks...</div></body></html>`;
    }
    getErrorHtml(message) {
        return `<!DOCTYPE html><html><body><div class="center">${(0, html_1.escapeHtml)(message)}</div></body></html>`;
    }
}
exports.TasksListPanel = TasksListPanel;
function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
//# sourceMappingURL=tasksListPanel.js.map