import * as vscode from 'vscode';
import { COMMANDS } from '../utils/constants';

const SEEN_KEY = 'rubiops.flowGuideSeen';

const SLIDES: Array<{ badge: string; title: string; body: string }> = [
  {
    badge: '1 of 6 — Overview',
    title: '⚡ Welcome to RubiOps',
    body: `<p>RubiOps is an <span class="highlight">AI coding agent</span> that sits between you and the AI you already use. Instead of sending your raw prompt directly, RubiOps:</p>
      <div class="flow">
        <div class="flow-step">Your idea</div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">✂️ Shortens it</div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">🤖 Your AI answers</div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">💾 Memory keeps it</div>
      </div>
      <p>The answer comes back in the Agent window. A task is run in the project.</p>`,
  },
  {
    badge: '2 of 6 — Open the Agent',
    title: 'Ask from the Agent window',
    body: `<p>Open <span class="highlight">Agent</span> in the RubiOps sidebar. That window is where every question is asked and every answer comes back.</p>
      <p>The menu at the top lists the AI already installed:</p>
      <p style="margin-left:16px">
        <span class="kbd">GitHub Copilot</span> &nbsp;
        <span class="kbd">Claude</span> &nbsp;
        <span class="kbd">Continue</span> &nbsp;
        <span class="kbd">Cursor</span>
      </p>
      <p>Any installed agent can start with <span class="kbd">/genie</span>. The rest of the line is the prompt. <span class="kbd">/genie</span> alone opens this guide.</p>
      <p style="margin-left:16px">
        ✅ <em>/genie run web app</em><br>
        ✅ <em>/genie explain this function</em><br>
        ✅ In Copilot chat, <span class="kbd">@genie</span> takes the same prompt
      </p>
      <div class="tip">💡 Tip: Pick the extension you already use. RubiOps guides that prompt, and the reply stays in this window.</div>`,
  },
  {
    badge: '3 of 6 — Ask in plain language',
    title: 'Just describe what you want',
    body: `<p>You don't need a special command. Write naturally:</p>
      <p style="margin-left:16px">
        ✅ <em>"send me the customer add file name"</em><br>
        ✅ <em>"explain this function"</em><br>
        ✅ <em>"write my standup"</em><br>
        ✅ <em>"run web app"</em><br>
        ✅ <em>/genie code review</em> or <em>/genie merge review</em>
      </p>
      <p>RubiOps reads the open file and the matching project files, then keeps only a short slice of that context.</p>
      <div class="tip">💡 Tip: A task such as "run web app" is started in the RubiOps terminal. Test, build, and install run to the end and the output comes back here.</div>`,
  },
  {
    badge: '4 of 6 — Memory',
    title: 'Repeated questions stay local',
    body: `<p>The same question is stored for this project, with a snapshot of the file fields.</p>
      <p style="margin-left:16px">
        <strong>Unchanged code</strong> — the saved answer is returned. The AI is not called.<br><br>
        <strong>Changed fields</strong> — only the changed lines are sent, the answer is rewritten, and the new snapshot is saved.
      </p>
      <div class="tip">💡 Tip: Asking again days later is safe. The answer changes when the fields change.</div>`,
  },
  {
    badge: '5 of 6 — Read the answer',
    title: 'The reply stays in this window',
    body: `<p>The Agent window tells you where the answer came from:</p>
      <p style="margin-left:16px">
        <strong>From local memory</strong> — the code is unchanged, so no AI call was made.<br><br>
        <strong>Redefined from the changed fields</strong> — only the diff was sent.<br><br>
        <strong>I started it</strong> — the task is running in the RubiOps terminal.
      </p>
      <div class="tip">💡 Tip: Open the RubiOps terminal for the URL when you ask to run the web app.</div>`,
  },
  {
    badge: '6 of 6 — Token watch',
    title: 'See what was used and saved',
    body: `<p>Open the dashboard. The rings show tokens used and tokens saved for each day.</p>
      <p style="margin-left:16px">
        <strong>Used</strong> — the shortened prompt that was sent.<br><br>
        <strong>Saved</strong> — text that stayed local and was not sent.
      </p>
      <div class="tip">🎉 You're set. Open the Agent and ask in plain language, including a task such as "run web app".</div>`,
  },
];

export class FlowGuidePanel {
  public static readonly viewType = 'devopsQuickUpdate.flowGuide';
  private panel?: vscode.WebviewPanel;

  constructor(private readonly globalState: vscode.Memento) {}

  async show(markSeen = false): Promise<void> {
    if (markSeen) {
      await this.globalState.update(SEEN_KEY, true);
    }
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      FlowGuidePanel.viewType,
      'RubiOps — How to Use',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openAgent') {
        await vscode.commands.executeCommand(COMMANDS.OPEN_AGENT);
      }
      if (message.type === 'openDashboard') {
        await vscode.commands.executeCommand(COMMANDS.OPEN_DASHBOARD);
      }
      if (message.type === 'close') {
        this.panel?.dispose();
      }
    });
    this.panel.webview.html = this.html();
  }

  static wasSeen(globalState: vscode.Memento): boolean {
    return globalState.get<boolean>(SEEN_KEY) === true;
  }

  private html(): string {
    const slides = SLIDES.map(
      (slide, index) => `<div class="slide${index === 0 ? ' active' : ''}" id="slide-${index}">
        <div class="step-badge">${slide.badge}</div>
        <h1>${slide.title}</h1>
        ${slide.body}
      </div>`
    ).join('\n');
    const dots = SLIDES.map((_, index) => `<div class="dot${index === 0 ? ' active' : ''}" onclick="goTo(${index})"></div>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0; padding: 0;
    display: flex; flex-direction: column; height: 100vh;
  }
  .slide { display: none; flex-direction: column; justify-content: center;
           align-items: flex-start; padding: 48px 64px; flex: 1; max-width: 680px; }
  .slide.active { display: flex; }
  .step-badge { font-size: 11px; font-weight: 600; letter-spacing: .1em;
                text-transform: uppercase; color: var(--vscode-textLink-foreground);
                margin-bottom: 12px; }
  h1 { font-size: 28px; font-weight: 700; margin: 0 0 16px;
       color: var(--vscode-foreground); line-height: 1.2; }
  p  { font-size: 14px; line-height: 1.7; color: var(--vscode-descriptionForeground);
       margin: 0 0 14px; }
  .highlight { color: var(--vscode-foreground); font-weight: 600; }
  .kbd { display: inline-block; padding: 2px 8px; border-radius: 4px;
         border: 1px solid var(--vscode-widget-border);
         background: var(--vscode-input-background);
         font-family: var(--vscode-editor-font-family);
         font-size: 12px; color: var(--vscode-foreground); }
  .flow { display: flex; align-items: center; gap: 10px; margin: 20px 0; flex-wrap: wrap; }
  .flow-step { background: var(--vscode-input-background); border: 1px solid var(--vscode-widget-border);
               border-radius: 6px; padding: 8px 14px; font-size: 13px; color: var(--vscode-foreground); }
  .flow-arrow { color: var(--vscode-textLink-foreground); font-size: 18px; }
  .tip { background: var(--vscode-inputValidation-infoBackground, rgba(0,120,212,.15));
         border-left: 3px solid var(--vscode-textLink-foreground);
         padding: 10px 14px; border-radius: 0 6px 6px 0;
         font-size: 13px; margin-top: 14px; color: var(--vscode-foreground); }
  .nav { display: flex; align-items: center; justify-content: space-between;
         padding: 16px 64px 24px; border-top: 1px solid var(--vscode-widget-border); }
  .dots { display: flex; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%;
         background: var(--vscode-widget-border); cursor: pointer; transition: background .2s; }
  .dot.active { background: var(--vscode-textLink-foreground); }
  .btn { padding: 8px 20px; border: none; border-radius: 6px; font-size: 13px;
         cursor: pointer; font-family: inherit; }
  .btn-primary { background: var(--vscode-button-background);
                 color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground);
                   color: var(--vscode-button-secondaryForeground); }
  .btn-secondary:hover { opacity: .8; }
  .extra { display: none; gap: 8px; }
  .extra.show { display: flex; }
</style>
</head>
<body>
${slides}
<div class="nav">
  <button class="btn btn-secondary" id="prev-btn" onclick="prev()" style="visibility:hidden">← Back</button>
  <div class="dots">
    ${dots}
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <button class="btn btn-secondary extra" id="watch-btn" onclick="openWatch()">Open token watch</button>
    <button class="btn btn-primary" id="next-btn" onclick="next()">Next →</button>
  </div>
</div>
<script>
  const vscode = acquireVsCodeApi();
  let current = 0;
  const total = ${SLIDES.length};

  function goTo(n) {
    document.getElementById('slide-' + current).classList.remove('active');
    document.querySelectorAll('.dot')[current].classList.remove('active');
    current = n;
    document.getElementById('slide-' + current).classList.add('active');
    document.querySelectorAll('.dot')[current].classList.add('active');
    document.getElementById('prev-btn').style.visibility = current === 0 ? 'hidden' : 'visible';
    document.getElementById('next-btn').textContent = current === total - 1 ? 'Open Agent' : 'Next →';
    document.getElementById('watch-btn').classList.toggle('show', current === total - 1);
  }
  function next() {
    if (current < total - 1) { goTo(current + 1); }
    else { vscode.postMessage({ type: 'openAgent' }); }
  }
  function prev() { if (current > 0) goTo(current - 1); }
  function openWatch() { vscode.postMessage({ type: 'openDashboard' }); }
</script>
</body>
</html>`;
  }
}
