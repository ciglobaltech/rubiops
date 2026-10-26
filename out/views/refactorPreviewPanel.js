"use strict";
/**
 * Refactor Preview Webview & Panel View Provider.
 * Provides the interactive "Refactor Preview" interface with Flutter standards,
 * multi-file selection, inline diffs, and [ Apply ] / [ Discard ] actions.
 */
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
exports.RefactorPreviewPanel = void 0;
const vscode = __importStar(require("vscode"));
class RefactorPreviewPanel {
    extensionUri;
    refactorService;
    static viewType = 'devopsQuickUpdate.refactorPreviewView';
    static currentPanel;
    _view;
    selectedFiles = new Set();
    constructor(extensionUri, refactorService) {
        this.extensionUri = extensionUri;
        this.refactorService = refactorService;
        this.refactorService.onFixesChanged((fixes) => {
            this.selectedFiles = new Set(fixes.map((f) => f.filePath));
            this.refresh();
        });
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        const fixes = this.refactorService.getFixes();
        this.selectedFiles = new Set(fixes.map((f) => f.filePath));
        webviewView.webview.html = this.getHtml(fixes);
        this.attachMessageHandlers(webviewView.webview);
        webviewView.onDidDispose(() => {
            this._view = undefined;
        });
    }
    refresh() {
        const fixes = this.refactorService.getFixes();
        const html = this.getHtml(fixes);
        if (this._view) {
            this._view.webview.html = html;
        }
        if (RefactorPreviewPanel.currentPanel) {
            RefactorPreviewPanel.currentPanel.webview.html = html;
        }
    }
    static async show(extensionUri, refactorService) {
        // Also try to focus the panel view if available
        try {
            await vscode.commands.executeCommand('devopsQuickUpdate.refactorPreviewView.focus');
        }
        catch {
            // If panel container is not focused, open standalone webview beside
        }
        if (RefactorPreviewPanel.currentPanel) {
            RefactorPreviewPanel.currentPanel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        const panel = vscode.window.createWebviewPanel('rubiopsRefactorPreviewTab', 'Refactor Preview', vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri],
        });
        RefactorPreviewPanel.currentPanel = panel;
        const instance = new RefactorPreviewPanel(extensionUri, refactorService);
        const fixes = refactorService.getFixes();
        instance.selectedFiles = new Set(fixes.map((f) => f.filePath));
        panel.webview.html = instance.getHtml(fixes);
        instance.attachMessageHandlers(panel.webview);
        panel.onDidDispose(() => {
            RefactorPreviewPanel.currentPanel = undefined;
        });
    }
    attachMessageHandlers(webview) {
        webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'toggleFile': {
                    const filePath = message.filePath;
                    if (message.checked) {
                        this.selectedFiles.add(filePath);
                    }
                    else {
                        this.selectedFiles.delete(filePath);
                    }
                    break;
                }
                case 'toggleAll': {
                    const selectAll = Boolean(message.checked);
                    const fixes = this.refactorService.getFixes();
                    if (selectAll) {
                        this.selectedFiles = new Set(fixes.map((f) => f.filePath));
                    }
                    else {
                        this.selectedFiles.clear();
                    }
                    this.refresh();
                    break;
                }
                case 'openFile': {
                    const fullPath = message.fullPath;
                    if (fullPath) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
                            await vscode.window.showTextDocument(doc);
                        }
                        catch {
                            // Ignore
                        }
                    }
                    break;
                }
                case 'apply': {
                    const filesToApply = Array.from(this.selectedFiles);
                    if (filesToApply.length === 0) {
                        vscode.window.showWarningMessage('No files selected to apply refactor fixes.');
                        return;
                    }
                    const result = await this.refactorService.applyFixes(filesToApply);
                    vscode.window.showInformationMessage(`RubiOps: Successfully applied Flutter standard refactors to ${result.appliedFiles} file(s) (${result.appliedFixes} fixes).`);
                    this.refresh();
                    break;
                }
                case 'discard': {
                    this.refactorService.setFixes([]);
                    this.selectedFiles.clear();
                    this.refresh();
                    vscode.window.showInformationMessage('Refactor preview discarded.');
                    if (RefactorPreviewPanel.currentPanel) {
                        RefactorPreviewPanel.currentPanel.dispose();
                    }
                    break;
                }
                case 'rescan': {
                    await this.refactorService.scanWorkspace();
                    this.refresh();
                    break;
                }
            }
        });
    }
    getHtml(groups) {
        const totalFiles = groups.length;
        const totalFixes = groups.reduce((acc, g) => acc + g.fixes.length, 0);
        const selectedCount = Array.from(this.selectedFiles).filter((f) => groups.some((g) => g.filePath === f)).length;
        const fileItemsHtml = groups
            .map((group) => {
            const isChecked = this.selectedFiles.has(group.filePath) ? 'checked' : '';
            const fixesHtml = group.fixes
                .map((fix) => `
            <div class="diff-line">
              <span class="line-badge">${fix.line ? `L${fix.line}` : ''}</span>
              <div class="code-snippet">${fix.previewLineHtml}</div>
            </div>`)
                .join('');
            return `
        <div class="file-card" data-filepath="${escapeAttr(group.filePath)}">
          <div class="file-header">
            <input type="checkbox" class="file-chk" data-filepath="${escapeAttr(group.filePath)}" ${isChecked} onchange="toggleFile(this, '${escapeJs(group.filePath)}')">
            <span class="dart-icon" title="Dart File">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M4 4L12 2L20 4L12 12L4 4Z" fill="#0284c7"/>
                <path d="M4 4L12 12L12 22L4 14L4 4Z" fill="#0369a1"/>
                <path d="M20 4L12 12L12 22L20 14L20 4Z" fill="#38bdf8"/>
              </svg>
            </span>
            <span class="file-name" onclick="openFile('${escapeJs(group.fullPath)}')">${escapeHtml(group.fileName)}</span>
            <span class="file-path">${escapeHtml(group.directory || '')}</span>
            <span class="fix-count-badge">${group.fixes.length} fix${group.fixes.length > 1 ? 'es' : ''}</span>
          </div>
          <div class="diff-container">
            ${fixesHtml}
          </div>
        </div>`;
        })
            .join('');
        const emptyStateHtml = `
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <h3>No Flutter Refactor Fixes Pending</h3>
        <p>Your Dart code complies with Flutter 3.x+ standards, or no review fixes have been loaded.</p>
        <button class="btn-rescan" onclick="rescan()">Scan Project for Flutter Standards</button>
      </div>`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refactor Preview</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      --cyan: #38bdf8;
      --accent: #0078d4;
      --del-bg: rgba(248, 81, 73, 0.25);
      --del-fg: #f85149;
      --add-bg: rgba(63, 185, 80, 0.25);
      --add-fg: #3fb950;
      --muted: var(--vscode-descriptionForeground, #8c8c8c);
      --card-bg: var(--vscode-sideBar-background, #181818);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: 13px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .preview-header {
      padding: 8px 14px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .header-title {
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--fg);
    }
    .header-meta {
      font-size: 11px;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .select-all-wrap {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      user-select: none;
    }
    .preview-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px 14px;
    }
    .file-card {
      margin-bottom: 14px;
      background: transparent;
      border-radius: 4px;
    }
    .file-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      font-size: 12px;
      user-select: none;
    }
    .file-chk {
      margin: 0;
      cursor: pointer;
      accent-color: var(--accent);
    }
    .dart-icon {
      display: flex;
      align-items: center;
    }
    .file-name {
      font-weight: 700;
      color: var(--fg);
      cursor: pointer;
    }
    .file-name:hover {
      text-decoration: underline;
      color: var(--cyan);
    }
    .file-path {
      color: #e5c07b;
      font-size: 11px;
      margin-left: 2px;
    }
    .fix-count-badge {
      font-size: 10px;
      color: var(--muted);
      background: rgba(128, 128, 128, 0.15);
      padding: 1px 6px;
      border-radius: 10px;
      margin-left: auto;
    }
    .diff-container {
      margin-left: 20px;
      padding: 4px 0 6px 8px;
      border-left: 1px solid rgba(128, 128, 128, 0.15);
    }
    .diff-line {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin: 4px 0;
      font-family: var(--vscode-editor-font-family, Consolas, Monaco, 'Courier New', monospace);
      font-size: 12px;
      line-height: 1.5;
    }
    .line-badge {
      font-size: 10px;
      color: var(--muted);
      min-width: 24px;
      flex-shrink: 0;
      opacity: 0.6;
    }
    .code-snippet {
      flex: 1;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--fg);
    }
    .diff-del {
      background: var(--del-bg);
      color: var(--del-fg);
      text-decoration: line-through;
      padding: 1px 3px;
      border-radius: 2px;
      margin-right: 2px;
    }
    .diff-add {
      background: var(--add-bg);
      color: var(--add-fg);
      font-weight: 600;
      padding: 1px 3px;
      border-radius: 2px;
    }
    .action-bar {
      padding: 8px 14px;
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .btn-apply {
      background: #0078d4;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      padding: 6px 18px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .btn-apply:hover {
      background: #0284c7;
    }
    .btn-discard {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ffffff);
      border: none;
      border-radius: 4px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      margin-left: 8px;
    }
    .btn-discard:hover {
      background: var(--vscode-button-secondaryHoverBackground, #484b4f);
    }
    .btn-rescan {
      background: transparent;
      border: 1px solid var(--cyan);
      color: var(--cyan);
      border-radius: 4px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      margin-top: 12px;
    }
    .btn-rescan:hover {
      background: rgba(56, 189, 248, 0.1);
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
    }
    .empty-icon {
      font-size: 32px;
      color: #34d399;
      margin-bottom: 8px;
    }
    .empty-state h3 {
      font-size: 15px;
      color: var(--fg);
      margin: 0 0 6px;
    }
  </style>
</head>
<body>
  <div class="preview-header">
    <div class="header-title">
      <span>⚡</span>
      <span>Refactor Preview (Flutter Standards)</span>
    </div>
    <div class="header-meta">
      <span id="selected-counter">${selectedCount} of ${totalFiles} files selected (${totalFixes} fixes)</span>
      <label class="select-all-wrap">
        <input type="checkbox" id="chk-select-all" ${totalFiles > 0 && selectedCount === totalFiles ? 'checked' : ''} onchange="toggleSelectAll(this)">
        <span>Select All</span>
      </label>
    </div>
  </div>

  <div class="preview-list">
    ${totalFiles > 0 ? fileItemsHtml : emptyStateHtml}
  </div>

  ${totalFiles > 0 ? `
  <div class="action-bar">
    <div style="display: flex; align-items: center;">
      <button class="btn-apply" onclick="applyFixes()">
        <span>✓</span> Apply
      </button>
      <button class="btn-discard" onclick="discardFixes()">Discard</button>
    </div>
    <div style="font-size: 11px; color: var(--muted);">
      Replaces deprecated APIs with modern Flutter 3.x+ standards
    </div>
  </div>` : ''}

  <script>
    const vscode = acquireVsCodeApi();

    function toggleFile(chk, filePath) {
      vscode.postMessage({ command: 'toggleFile', filePath, checked: chk.checked });
      updateSelectedCount();
    }

    function toggleSelectAll(chk) {
      vscode.postMessage({ command: 'toggleAll', checked: chk.checked });
    }

    function openFile(fullPath) {
      vscode.postMessage({ command: 'openFile', fullPath });
    }

    function applyFixes() {
      vscode.postMessage({ command: 'apply' });
    }

    function discardFixes() {
      vscode.postMessage({ command: 'discard' });
    }

    function rescan() {
      vscode.postMessage({ command: 'rescan' });
    }

    function updateSelectedCount() {
      const allChks = document.querySelectorAll('.file-chk');
      let count = 0;
      allChks.forEach(c => { if (c.checked) count++; });
      const counter = document.getElementById('selected-counter');
      if (counter) {
        counter.textContent = count + ' of ' + allChks.length + ' files selected';
      }
      const allSelect = document.getElementById('chk-select-all');
      if (allSelect) {
        allSelect.checked = (count === allChks.length && count > 0);
      }
    }
  </script>
</body>
</html>`;
    }
}
exports.RefactorPreviewPanel = RefactorPreviewPanel;
function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(value) {
    return value.replace(/"/g, '&quot;');
}
function escapeJs(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
//# sourceMappingURL=refactorPreviewPanel.js.map