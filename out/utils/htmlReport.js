"use strict";
/**
 * Module reports are saved as HTML files and opened when a file is needed.
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
exports.writeHtmlReport = writeHtmlReport;
exports.showHtmlReport = showHtmlReport;
exports.openHtmlReport = openHtmlReport;
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
let activeReportPanel;
let currentReportFile;
async function writeHtmlReport(kind, markdown) {
    const title = firstHeading(markdown) || 'RubiOps';
    const file = path.join(os.tmpdir(), `rubiops-${kind}-${Date.now()}.html`);
    await fs.writeFile(file, renderHtml(title, markdown), 'utf8');
    return file;
}
async function showHtmlReport(file, customTitle) {
    currentReportFile = file;
    let content = '';
    try {
        content = await fs.readFile(file, 'utf8');
    }
    catch (err) {
        content = `<p>Report could not be read: ${err instanceof Error ? err.message : String(err)}</p>`;
    }
    const headingMatch = content.match(/<title>(.*?)<\/title>/i) || content.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
    const panelTitle = customTitle || headingMatch?.[1] || 'RubiOps Report';
    if (activeReportPanel) {
        try {
            activeReportPanel.title = panelTitle;
            activeReportPanel.webview.html = content;
            activeReportPanel.reveal(activeReportPanel.viewColumn || vscode.ViewColumn.Beside);
            return activeReportPanel;
        }
        catch {
            activeReportPanel = undefined;
        }
    }
    activeReportPanel = vscode.window.createWebviewPanel('rubiopsReport', panelTitle, vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });
    activeReportPanel.onDidDispose(() => {
        activeReportPanel = undefined;
    });
    activeReportPanel.webview.onDidReceiveMessage(async (message) => {
        if (message?.command === 'openExternal' && currentReportFile) {
            await vscode.env.openExternal(vscode.Uri.file(currentReportFile));
        }
        else if (message?.command === 'openRefactorPreview') {
            await vscode.commands.executeCommand('devopsQuickUpdate.openRefactorPreview');
        }
    });
    activeReportPanel.webview.html = content;
    return activeReportPanel;
}
async function openHtmlReport(kind, markdown) {
    const file = await writeHtmlReport(kind, markdown);
    const title = firstHeading(markdown) || 'RubiOps Report';
    await showHtmlReport(file, title);
    return file;
}
function firstHeading(markdown) {
    const match = markdown.match(/^#{1,3}\s+(.+)$/m);
    return match ? match[1].replace(/[*_`]/g, '').trim() : '';
}
function renderHtml(title, markdown) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --report-bg: var(--vscode-editor-background, #1e1e1e);
      --report-fg: var(--vscode-editor-foreground, #d4d4d4);
      --report-card: var(--vscode-editorWidget-background, #252526);
      --report-border: var(--vscode-panel-border, rgba(128,128,128,0.25));
      --report-accent: #38bdf8;
    }
    body {
      margin: 0;
      background: var(--report-bg);
      color: var(--report-fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: 13px;
      line-height: 1.6;
    }
    main { max-width: 960px; margin: 0 auto; padding: 24px 28px 64px; }
    .report-brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--report-border);
      padding-bottom: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-tag {
      font-weight: 700;
      font-size: 14px;
      color: var(--report-accent);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .date-tag {
      font-size: 11px;
      opacity: 0.7;
    }
    .brand-actions {
      display: flex;
      gap: 8px;
    }
    .btn-action {
      background: var(--vscode-button-secondaryBackground, #2d2d2d);
      color: var(--vscode-button-secondaryForeground, #ffffff);
      border: 1px solid var(--report-border);
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn-action:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3d3d3d);
      border-color: var(--report-accent);
    }
    h1, h2, h3, h4 { color: var(--vscode-editor-foreground, #ffffff); line-height: 1.3; }
    h1 { font-size: 22px; margin: 0 0 16px; border-bottom: 1px solid var(--report-border); padding-bottom: 8px; }
    h2 { font-size: 16px; margin: 24px 0 10px; color: var(--report-accent); }
    h3 { font-size: 14px; margin: 18px 0 8px; }
    a { color: var(--vscode-textLink-foreground, var(--report-accent)); }
    code { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); padding: 2px 6px; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
    pre { background: var(--vscode-textCodeBlock-background, #141414); border: 1px solid var(--report-border); padding: 12px 14px; border-radius: 8px; overflow: auto; }
    pre code { background: transparent; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 14px 0 20px; }
    th, td { border: 1px solid var(--report-border); padding: 8px 12px; text-align: left; vertical-align: top; }
    th { background: var(--report-card); font-weight: 600; }
    blockquote { margin: 14px 0; padding: 10px 16px; border-left: 3px solid var(--report-accent); background: rgba(56, 189, 248, 0.08); border-radius: 0 6px 6px 0; }
    ul { padding-left: 22px; margin: 8px 0; }
    li { margin-bottom: 4px; }
    hr { border: none; border-top: 1px solid var(--report-border); margin: 24px 0; }
  </style>
</head>
<body>
  <main>
    <div class="report-brand">
      <div class="brand-left">
        <span class="brand-tag">⚡ RubiOps</span>
        <span class="date-tag">${new Date().toLocaleString()}</span>
      </div>
      <div class="brand-actions">
        <button class="btn-action" style="background: #0078d4; color: #ffffff; border-color: #0284c7;" onclick="openRefactorPreview()">⚡ Refactor Preview</button>
        <button class="btn-action" onclick="openExternal()">🌐 Open in Browser</button>
        <button class="btn-action" onclick="window.print()">🖨️ Print / PDF</button>
      </div>
    </div>
    ${markdownToHtml(markdown)}
  </main>
  <script>
    const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
    function openExternal() {
      if (vscode) {
        vscode.postMessage({ command: 'openExternal' });
      }
    }
    function openRefactorPreview() {
      if (vscode) {
        vscode.postMessage({ command: 'openRefactorPreview' });
      }
    }
  </script>
</body>
</html>`;
}
function markdownToHtml(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (line.trim().startsWith('```')) {
            const code = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                code.push(lines[index]);
                index += 1;
            }
            html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
            index += 1;
            continue;
        }
        if (line.trim().startsWith('|')) {
            const rows = [];
            while (index < lines.length && lines[index].trim().startsWith('|')) {
                const cells = lines[index].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
                if (!cells.every((cell) => /^:?-+:?$/.test(cell))) {
                    rows.push(cells);
                }
                index += 1;
            }
            if (rows.length) {
                const head = rows[0].map((cell) => `<th>${inline(cell)}</th>`).join('');
                const body = rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('');
                html.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
            }
            continue;
        }
        if (/^#{1,4}\s+/.test(line)) {
            const level = line.match(/^#+/)?.[0].length ?? 1;
            html.push(`<h${level}>${inline(line.replace(/^#{1,4}\s+/, ''))}</h${level}>`);
            index += 1;
            continue;
        }
        if (/^>\s?/.test(line)) {
            const quote = [];
            while (index < lines.length && /^>\s?/.test(lines[index])) {
                quote.push(lines[index].replace(/^>\s?/, ''));
                index += 1;
            }
            html.push(`<blockquote>${quote.map((part) => inline(part)).join('<br>')}</blockquote>`);
            continue;
        }
        if (/^(\s*[-*]|\s*\d+\.)\s+/.test(line)) {
            const items = [];
            while (index < lines.length && /^(\s*[-*]|\s*\d+\.)\s+/.test(lines[index])) {
                items.push(`<li>${inline(lines[index].replace(/^(\s*[-*]|\s*\d+\.)\s+/, ''))}</li>`);
                index += 1;
            }
            html.push(`<ul>${items.join('')}</ul>`);
            continue;
        }
        if (line.trim() === '---') {
            html.push('<hr>');
            index += 1;
            continue;
        }
        if (!line.trim()) {
            index += 1;
            continue;
        }
        html.push(`<p>${inline(line)}</p>`);
        index += 1;
    }
    return html.join('\n');
}
function inline(value) {
    return escapeHtml(value)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
//# sourceMappingURL=htmlReport.js.map