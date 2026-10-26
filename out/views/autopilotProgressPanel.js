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
exports.AutopilotProgressPanel = void 0;
const vscode = __importStar(require("vscode"));
const html_1 = require("../utils/html");
const constants_1 = require("../utils/constants");
/**
 * Full-editor progress view so users see Broken list + live Autopilot activity.
 */
class AutopilotProgressPanel {
    static viewType = 'devopsQuickUpdate.autopilotProgress';
    panel;
    logs = [];
    brokenList = [];
    current = {
        phase: 'idle',
        title: 'RubiOps Autopilot',
        detail: 'Waiting to start…',
        percent: 0,
        running: false,
    };
    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One, false);
            this.render();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(AutopilotProgressPanel.viewType, 'RubiOps Autopilot', { viewColumn: vscode.ViewColumn.One, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'runAgain') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.RUN_BUG_WATCH);
            }
            if (message.type === 'openDashboard') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_DASHBOARD);
            }
            if (message.type === 'connectAdo') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.CONNECT);
            }
            if (message.type === 'openWorkItem' && typeof message.id === 'number') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_WORK_ITEM, message.id);
            }
        });
        this.render();
    }
    push(event) {
        if (event.brokenList) {
            this.brokenList = event.brokenList;
        }
        this.current = {
            ...this.current,
            ...event,
            running: event.running ?? this.current.running,
            brokenList: this.brokenList,
        };
        if (event.logLine) {
            const stamp = new Date().toLocaleTimeString();
            this.logs.push(`[${stamp}] ${event.logLine}`);
            if (this.logs.length > 400) {
                this.logs = this.logs.slice(-400);
            }
        }
        if (this.panel) {
            this.render();
        }
    }
    updateBrokenItem(id, patch) {
        this.brokenList = this.brokenList.map((item) => item.id === id ? { ...item, ...patch } : item);
        this.current = { ...this.current, brokenList: this.brokenList };
        if (this.panel) {
            this.render();
        }
    }
    resetLogs() {
        this.logs = [];
        this.brokenList = [];
        this.current = {
            phase: 'idle',
            title: 'RubiOps Autopilot',
            detail: 'Waiting to start…',
            percent: 0,
            running: false,
            brokenList: [],
        };
    }
    render() {
        if (!this.panel) {
            return;
        }
        this.panel.webview.html = this.getHtml(this.current, this.logs, this.brokenList);
    }
    getHtml(state, logs, brokenList) {
        const percent = Math.max(0, Math.min(100, state.percent ?? 0));
        const phaseLabel = phaseDisplay(state.phase);
        const spinning = state.running ? 'spin' : '';
        const workItem = state.workItemId !== undefined
            ? `<button class="link" onclick="openItem(${state.workItemId})">#${state.workItemId} ${(0, html_1.escapeHtml)(state.workItemTitle ?? '')}</button>`
            : '<span class="muted">—</span>';
        const logHtml = logs
            .slice()
            .reverse()
            .map((line) => {
            const cls = /failed|PAT|Personal Access Token|error/i.test(line)
                ? 'log-line err'
                : /tested|comment posted|complete|Verdict|PASSED/i.test(line)
                    ? 'log-line ok'
                    : 'log-line';
            return `<div class="${cls}">${(0, html_1.escapeHtml)(line)}</div>`;
        })
            .join('');
        const brokenHtml = brokenList.length === 0
            ? `<div class="empty">No Broken-tagged bugs in this run yet.</div>`
            : brokenList
                .map((item) => {
                const status = item.status ?? 'queued';
                const verdict = item.verdict ? ` · ${(0, html_1.escapeHtml)(item.verdict)}` : '';
                return `<button class="broken-row ${status}" onclick="openItem(${item.id})">
                <span class="bid">#${item.id}</span>
                <span class="btitle">${(0, html_1.escapeHtml)(item.title)}</span>
                <span class="bmeta">${(0, html_1.escapeHtml)(item.state ?? '')} · ${status}${verdict}</span>
              </button>`;
            })
                .join('');
        const tested = brokenList.filter((b) => b.status === 'tested').length;
        const failedBroken = brokenList.filter((b) => b.status === 'failed').length;
        const patBanner = state.patWriteError
            ? `<div class="banner err">
          <strong>Comments / tags could not be written</strong>
          <p>Your Azure DevOps PAT needs <b>Work Items — Read &amp; write</b>. Click Connect ADO, create a new PAT with that scope, then Run Autopilot again.</p>
          <button onclick="connectAdo()">Connect ADO (fix PAT)</button>
        </div>`
            : '';
        const completeBanner = state.phase === 'done' && !state.patWriteError
            ? `<div class="banner ok">
            <strong>Automated testing finished</strong>
            <p>Broken queue: ${brokenList.length} · Tested: ${tested} · Failed: ${failedBroken} · Comments posted: ${state.commentsPosted ?? 0}</p>
          </div>`
            : state.phase === 'done' && state.patWriteError
                ? `<div class="banner err">
              <strong>Run finished but ADO writes failed</strong>
              <p>Fix PAT write permission, then re-run. Broken list is shown below so you can see what should have been tested.</p>
            </div>`
                : '';
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --card: var(--vscode-sideBar-background);
      --ok: #3fa66b;
      --err: #d16969;
    }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: var(--vscode-font-family);
      background: radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent),
                  var(--bg);
      color: var(--fg);
      display: flex; flex-direction: column;
    }
    .shell { flex: 1; display: flex; flex-direction: column; padding: 22px 28px 16px; min-height: 0; box-sizing: border-box; }
    .eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
    h1 { margin: 0; font-size: 26px; font-weight: 700; }
    .subtitle { margin: 6px 0 14px; color: var(--muted); font-size: 13px; }
    .banner { border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; border: 1px solid var(--border); }
    .banner.ok { background: color-mix(in srgb, var(--ok) 16%, transparent); border-color: color-mix(in srgb, var(--ok) 40%, var(--border)); }
    .banner.err { background: color-mix(in srgb, var(--err) 16%, transparent); border-color: color-mix(in srgb, var(--err) 45%, var(--border)); }
    .banner p { margin: 6px 0 10px; font-size: 12px; line-height: 1.4; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1.1fr; gap: 12px; flex: 1; min-height: 0; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: color-mix(in srgb, var(--card) 88%, transparent);
      border: 1px solid var(--border); border-radius: 14px; padding: 14px;
      display: flex; flex-direction: column; min-height: 0;
    }
    .phase-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .orb {
      width: 48px; height: 48px; border-radius: 50%;
      border: 3px solid color-mix(in srgb, var(--accent) 55%, var(--border));
      display: grid; place-items: center; font-size: 18px; position: relative;
    }
    .orb.spin::after {
      content: ''; position: absolute; inset: -4px; border-radius: 50%;
      border: 3px solid transparent; border-top-color: var(--accent);
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .phase-title { font-size: 16px; font-weight: 650; margin: 0; }
    .phase-detail { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.4; }
    .meter { height: 10px; background: color-mix(in srgb, var(--fg) 10%, transparent); border-radius: 999px; overflow: hidden; margin: 10px 0 6px; }
    .meter > i { display: block; height: 100%; width: ${percent}%; background: var(--accent); border-radius: 999px; transition: width 0.25s ease; }
    .meta { font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; }
    .steps { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; }
    .steps li {
      display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 8px;
      background: color-mix(in srgb, var(--bg) 70%, transparent); border: 1px solid color-mix(in srgb, var(--border) 80%, transparent); font-size: 12px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; background: var(--muted); flex: 0 0 auto; }
    .dot.on { background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
    .dot.done { background: var(--ok); }
    .work { margin-top: 12px; font-size: 12px; }
    .work strong { display: block; font-size: 10px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    h2 { margin: 0 0 8px; font-size: 13px; }
    .broken-list, .log-scroll {
      flex: 1; overflow: auto; background: var(--bg); border-radius: 10px; padding: 8px;
      border: 1px solid var(--border);
    }
    .broken-row {
      width: 100%; text-align: left; display: grid; grid-template-columns: auto 1fr; gap: 2px 8px;
      background: transparent; border: 1px solid transparent; border-radius: 8px; color: var(--fg);
      padding: 8px; cursor: pointer; margin-bottom: 4px;
    }
    .broken-row:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .broken-row.running { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
    .broken-row.tested { border-color: color-mix(in srgb, var(--ok) 45%, var(--border)); }
    .broken-row.failed { border-color: color-mix(in srgb, var(--err) 45%, var(--border)); }
    .bid { font-weight: 700; font-size: 12px; }
    .btitle { grid-column: 2; font-size: 12px; }
    .bmeta { grid-column: 1 / -1; font-size: 10px; color: var(--muted); }
    .empty { color: var(--muted); font-size: 12px; padding: 8px; }
    .log-line { padding: 2px 0; border-bottom: 1px dashed color-mix(in srgb, var(--border) 70%, transparent); white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; }
    .log-line.err { color: var(--err); }
    .log-line.ok { color: var(--ok); }
    .actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    button {
      background: var(--accent); color: var(--accent-fg); border: none;
      padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;
    }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button.link { background: transparent; color: var(--vscode-textLink-foreground); padding: 0; text-decoration: underline; font-size: 12px; }
  </style>
</head>
<body>
  <div class="shell">
    <p class="eyebrow">RubiOps · Live run</p>
    <h1>Bug Autopilot</h1>
    <p class="subtitle">Broken list, live testing progress, and ADO comment status — all in one view.</p>
    ${patBanner}
    ${completeBanner}

    <div class="grid">
      <section class="card">
        <div class="phase-row">
          <div class="orb ${spinning}">🧞</div>
          <div>
            <p class="phase-title">${(0, html_1.escapeHtml)(state.title || phaseLabel)}</p>
            <p class="phase-detail">${(0, html_1.escapeHtml)(state.detail || '')}</p>
          </div>
        </div>
        <div class="meter"><i></i></div>
        <div class="meta"><span>${percent}%</span><span>${(0, html_1.escapeHtml)(phaseLabel)}</span></div>
        <ul class="steps">${renderSteps(state.phase)}</ul>
        <div class="work"><strong>Current work item</strong>${workItem}</div>
        <div class="actions">
          <button onclick="runAgain()" ${state.running ? 'disabled' : ''}>Run again</button>
          <button class="secondary" onclick="openDash()">Open Dashboard</button>
          <button class="secondary" onclick="connectAdo()">Connect ADO</button>
        </div>
      </section>

      <section class="card">
        <h2>Broken list (${brokenList.length})</h2>
        <div class="broken-list">${brokenHtml}</div>
      </section>

      <section class="card">
        <h2>Live activity log</h2>
        <div class="log-scroll">${logHtml || '<div class="empty">Waiting for Autopilot events…</div>'}</div>
      </section>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function runAgain() { vscode.postMessage({ type: 'runAgain' }); }
    function openDash() { vscode.postMessage({ type: 'openDashboard' }); }
    function connectAdo() { vscode.postMessage({ type: 'connectAdo' }); }
    function openItem(id) { vscode.postMessage({ type: 'openWorkItem', id }); }
  </script>
</body>
</html>`;
    }
}
exports.AutopilotProgressPanel = AutopilotProgressPanel;
function renderSteps(phase) {
    const steps = [
        { label: 'Scan assigned Bugs', key: 'scanning' },
        { label: 'Apply TodayAssigned + work plan', key: 'planning' },
        { label: 'Broken tag → login + test + screenshots', key: 'testing' },
        { label: 'Write Description / Discussion comments', key: 'commenting' },
    ];
    const order = [
        'idle',
        'starting',
        'scanning',
        'tagging',
        'planning',
        'testing',
        'commenting',
        'done',
        'error',
    ];
    const normalized = phase === 'tagging' ? 'planning' : phase;
    const current = order.indexOf(normalized);
    return steps
        .map((step) => {
        const stepIdx = order.indexOf(step.key);
        let cls = 'dot';
        if (normalized === 'done' || current > stepIdx) {
            cls = 'dot done';
        }
        else if (normalized === step.key || (step.key === 'planning' && phase === 'tagging')) {
            cls = 'dot on';
        }
        return `<li><span class="${cls}"></span><span>${(0, html_1.escapeHtml)(step.label)}</span></li>`;
    })
        .join('');
}
function phaseDisplay(phase) {
    switch (phase) {
        case 'starting':
            return 'Starting';
        case 'scanning':
            return 'Scanning Bugs';
        case 'tagging':
            return 'Tagging';
        case 'planning':
            return 'Writing work plan';
        case 'testing':
            return 'Running Broken tests';
        case 'commenting':
            return 'Posting results';
        case 'done':
            return 'Complete';
        case 'error':
            return 'Error';
        default:
            return 'Idle';
    }
}
//# sourceMappingURL=autopilotProgressPanel.js.map