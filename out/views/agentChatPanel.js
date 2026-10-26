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
exports.AgentChatPanel = void 0;
const vscode = __importStar(require("vscode"));
const agentChain_1 = require("../services/agentChain");
const agentPlatform_1 = require("../services/agentPlatform");
const genieCall_1 = require("../services/genieCall");
const tokenOptimizer_1 = require("../services/tokenOptimizer");
const constants_1 = require("../utils/constants");
const html_1 = require("../utils/html");
const PLATFORM_KEY = 'rubiops.agentPlatformId';
const LEGACY_PLATFORM_KEY = 'smartgenie.agentPlatformId';
class AgentChatPanel {
    globalState;
    secrets;
    onUsage;
    static viewType = 'devopsQuickUpdate.agentChat';
    panel;
    messages = [];
    busy = false;
    platforms = [];
    selectedId = '';
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    constructor(globalState, secrets, onUsage) {
        this.globalState = globalState;
        this.secrets = secrets;
        this.onUsage = onUsage;
    }
    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            await this.refreshPlatforms();
            this.render();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(AgentChatPanel.viewType, 'RubiOps Agent', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        this.selectedId = this.globalState.get(PLATFORM_KEY) ?? this.globalState.get(LEGACY_PLATFORM_KEY) ?? '';
        await this.refreshPlatforms();
        if (this.messages.length === 0) {
            const current = this.currentPlatform();
            this.messages.push({
                role: 'agent',
                text: current
                    ? `Ask anything, or start with /genie and your prompt. The answer comes back in this window from ${current.label}. /genie alone opens the guide.`
                    : 'Ask anything, or start with /genie and your prompt. Sign in to Copilot, Claude, or Continue, then pick it at the top.',
            });
        }
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'switch' && typeof message.id === 'string') {
                this.selectedId = message.id;
                await this.globalState.update(PLATFORM_KEY, message.id);
                this.render();
            }
            if (message.type === 'ask' && typeof message.query === 'string') {
                await this.submit(message.query);
            }
        });
        this.render();
    }
    async refreshPlatforms() {
        this.platforms = await (0, agentPlatform_1.listAgentPlatforms)();
        const current = (0, agentPlatform_1.choosePlatform)(this.platforms, this.selectedId);
        this.selectedId = current?.id ?? '';
    }
    currentPlatform() {
        return (0, agentPlatform_1.choosePlatform)(this.platforms, this.selectedId);
    }
    async submit(query) {
        if (!this.panel) {
            await this.show();
        }
        return this.handleAsk(query);
    }
    async handleAsk(query) {
        const trimmed = query.trim();
        if (!trimmed || !this.panel) {
            return '';
        }
        if (this.busy) {
            return 'RubiOps is already working on a prompt.';
        }
        const call = (0, genieCall_1.splitGenieCall)(trimmed);
        if (call?.guideOnly) {
            const reply = 'The guide is open. Put your prompt after /genie, for example /genie run web app.';
            this.messages.push({ role: 'user', text: trimmed });
            this.messages.push({ role: 'agent', text: reply });
            this.render();
            await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_GUIDE);
            return reply;
        }
        const prompt = call?.prompt ?? trimmed;
        const reviewCommand = /\bmerge review\b/i.test(prompt)
            ? constants_1.COMMANDS.MERGE_REVIEW
            : /\bcode review\b/i.test(prompt)
                ? constants_1.COMMANDS.CODE_REVIEW
                : '';
        if (reviewCommand) {
            const reply = reviewCommand === constants_1.COMMANDS.MERGE_REVIEW
                ? 'Merge Review is open. Pick the base branch, then the head branch. The impact report opens when it is ready.'
                : 'Code Review is open. Pick an Azure branch or the local folder. The impact report opens when it is ready.';
            this.messages.push({ role: 'user', text: trimmed });
            this.messages.push({ role: 'agent', text: reply });
            this.render();
            await vscode.commands.executeCommand(reviewCommand);
            return reply;
        }
        const platform = this.currentPlatform();
        if (!platform) {
            this.messages.push({ role: 'user', text: trimmed });
            const reply = 'No AI extension is available. Sign in to Copilot, Claude, or Continue, then choose it at the top.';
            this.messages.push({ role: 'agent', text: reply });
            this.render();
            return reply;
        }
        this.busy = true;
        this.messages.push({ role: 'user', text: trimmed });
        this.messages.push({ role: 'agent', text: `Asking ${platform.label}…` });
        this.render();
        try {
            const prior = this.messages
                .filter((message) => message.role === 'user')
                .slice(0, -1)
                .map((message) => ({ query: message.text }));
            const result = await (0, agentChain_1.runAgentChain)(prompt, prior, platform, this.secrets, this.sessionId, (text) => {
                this.panel?.webview.postMessage({ type: 'stream', text });
            });
            this.messages.pop();
            this.messages.push({
                role: 'agent',
                text: result.reply,
                detail: result.exhausted ? undefined : result.optimizedPrompt,
            });
            this.onUsage?.();
            return result.reply;
        }
        catch (error) {
            this.messages.pop();
            const message = error instanceof Error ? error.message : 'The agent could not send that question.';
            this.messages.push({ role: 'agent', text: message });
            return message;
        }
        finally {
            this.busy = false;
            this.render();
        }
    }
    render() {
        if (!this.panel) {
            return;
        }
        const platform = this.currentPlatform();
        const budget = (0, tokenOptimizer_1.readTokenBudget)();
        const today = (0, tokenOptimizer_1.readTokenHistory)(1)[0];
        const savedToday = today?.saved ?? 0;
        const options = this.platforms
            .map((item) => `<option value="${(0, html_1.escapeHtml)(item.id)}"${item.id === this.selectedId ? ' selected' : ''}>${(0, html_1.escapeHtml)(item.label)}</option>`)
            .join('');
        const switcher = options
            ? `<select id="platform" ${this.busy ? 'disabled' : ''}>${options}</select>`
            : `<span class="muted">No AI signed in</span>`;
        const thread = this.messages
            .map((message, index) => {
            const detail = message.detail
                ? `<details class="sent"><summary>Prompt sent</summary><pre>${(0, html_1.escapeHtml)(message.detail)}</pre></details>`
                : '';
            const live = this.busy && index === this.messages.length - 1 && message.role === 'agent' ? ' id="live"' : '';
            return `<div class="bubble ${message.role}"><div class="who">${message.role === 'user' ? 'You' : 'Agent'}</div><div class="text"${live}>${(0, html_1.escapeHtml)(message.text)}</div>${detail}</div>`;
        })
            .join('');
        this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .shell { display: flex; flex-direction: column; height: 100vh; }
    header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    header h1 { margin: 0; font-size: 15px; font-weight: 650; }
    header p { margin: 2px 0 0; font-size: 11px; color: var(--vscode-descriptionForeground); }
    select {
      max-width: 240px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 8px;
      padding: 6px 8px;
      font: inherit;
      font-size: 12px;
    }
    .muted { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .saved { font-size: 12px; font-weight: 650; color: #34d399; }
    .side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .thread { flex: 1; overflow: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 12px; }
    .bubble { max-width: 78%; padding: 10px 12px; border-radius: 12px; }
    .bubble.user { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .bubble.agent { align-self: flex-start; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); }
    .who { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.7; margin-bottom: 4px; }
    .text { white-space: pre-wrap; font-size: 13px; line-height: 1.45; }
    details.sent { margin-top: 8px; font-size: 11px; }
    details.sent pre {
      white-space: pre-wrap;
      margin: 6px 0 0;
      padding: 8px;
      border-radius: 8px;
      background: var(--vscode-textCodeBlock-background);
    }
    form {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    textarea {
      flex: 1;
      resize: none;
      min-height: 46px;
      max-height: 140px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font: inherit;
    }
    button {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      cursor: pointer;
      font-weight: 650;
    }
    button:disabled { opacity: 0.6; cursor: default; }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>Agent</h1>
        <p>${(0, html_1.escapeHtml)(platform?.label ?? 'Pick an AI')} · ${budget.usedToday.toLocaleString()} used today</p>
      </div>
      <div class="side">${switcher}<div class="saved">${savedToday.toLocaleString()} saved today</div></div>
    </header>
    <div class="thread" id="thread">${thread}</div>
    <form id="composer">
      <textarea id="box" rows="2" placeholder="Ask anything, or /genie your prompt" ${this.busy ? 'disabled' : ''}></textarea>
      <button type="submit" ${this.busy ? 'disabled' : ''}>Send</button>
    </form>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const box = document.getElementById('box');
    const thread = document.getElementById('thread');
    const platform = document.getElementById('platform');
    thread.scrollTop = thread.scrollHeight;
    if (platform) {
      platform.addEventListener('change', () => {
        vscode.postMessage({ type: 'switch', id: platform.value });
      });
    }
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'stream') {
        const live = document.getElementById('live');
        if (live) {
          live.textContent = event.data.text;
          thread.scrollTop = thread.scrollHeight;
        }
      }
    });
    if (!box.disabled) {
      box.focus();
    }
    document.getElementById('composer').addEventListener('submit', (event) => {
      event.preventDefault();
      const query = box.value.trim();
      if (!query) return;
      vscode.postMessage({ type: 'ask', query });
      box.value = '';
    });
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        document.getElementById('composer').requestSubmit();
      }
    });
  </script>
</body>
</html>`;
    }
}
exports.AgentChatPanel = AgentChatPanel;
//# sourceMappingURL=agentChatPanel.js.map