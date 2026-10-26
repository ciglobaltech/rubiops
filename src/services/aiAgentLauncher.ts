import * as vscode from 'vscode';

export type AiAgentId = 'cursor' | 'copilot' | 'vscode-chat' | 'continue' | 'cline' | 'copy';

export interface AiAgentOption {
  id: AiAgentId;
  label: string;
  detail: string;
  extensionIds: string[];
}

const AGENT_OPTIONS: AiAgentOption[] = [
  {
    id: 'cursor',
    label: 'Cursor Agent / Composer',
    detail: 'Opens Cursor chat with the prompt (clipboard paste)',
    extensionIds: [],
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot Chat',
    detail: 'Opens Copilot Chat with the prompt',
    extensionIds: ['GitHub.copilot-chat'],
  },
  {
    id: 'vscode-chat',
    label: 'VS Code Chat',
    detail: 'Opens built-in VS Code chat',
    extensionIds: [],
  },
  {
    id: 'continue',
    label: 'Continue',
    detail: 'Opens Continue chat',
    extensionIds: ['Continue.continue'],
  },
  {
    id: 'cline',
    label: 'Cline',
    detail: 'Opens Cline (Claude Dev)',
    extensionIds: ['saoudrizwan.claude-dev'],
  },
  {
    id: 'copy',
    label: 'Copy prompt only',
    detail: 'Copy to clipboard without opening a chat panel',
    extensionIds: [],
  },
];

function isCursorEditor(): boolean {
  return /cursor/i.test(vscode.env.appName);
}

function isExtensionInstalled(extensionId: string): boolean {
  return Boolean(vscode.extensions.getExtension(extensionId));
}

export function getAvailableAiAgents(): AiAgentOption[] {
  const available: AiAgentOption[] = [];

  for (const option of AGENT_OPTIONS) {
    if (option.id === 'cursor' && isCursorEditor()) {
      available.push(option);
      continue;
    }
    if (option.id === 'vscode-chat' && !isCursorEditor()) {
      available.push(option);
      continue;
    }
    if (option.id === 'copy') {
      available.push(option);
      continue;
    }
    if (option.extensionIds.some((id) => isExtensionInstalled(id))) {
      available.push(option);
    }
  }

  return available;
}

/** The AI already installed for this developer. No picker on every message. */
export function resolveDefaultAiAgent(): AiAgentOption {
  const available = getAvailableAiAgents();
  const preferred = vscode.workspace
    .getConfiguration('devopsQuickUpdate')
    .get<string>('ai.preferredAgent', 'auto');

  if (preferred && preferred !== 'auto') {
    const match = available.find((agent) => agent.id === preferred);
    if (match) {
      return match;
    }
  }

  return (
    available.find((agent) => agent.id !== 'copy') ??
    available[0] ?? {
      id: 'copy',
      label: 'Clipboard',
      detail: 'Copy the prompt',
      extensionIds: [],
    }
  );
}

export async function resolveAiAgentChoice(
  available: AiAgentOption[]
): Promise<AiAgentOption | undefined> {
  if (available.length === 0) {
    return undefined;
  }

  const preferred = vscode.workspace
    .getConfiguration('devopsQuickUpdate')
    .get<string>('ai.preferredAgent', 'auto');

  if (preferred !== 'auto') {
    const match = available.find((agent) => agent.id === preferred);
    if (match) {
      return match;
    }
  }

  if (available.length === 1) {
    return available[0];
  }

  const pick = await vscode.window.showQuickPick(
    available.map((agent) => ({
      label: agent.label,
      description: agent.detail,
      agent,
    })),
    {
      title: 'Open task prompt in AI agent',
      placeHolder: 'Choose where to send the implementation prompt',
    }
  );

  return pick?.agent;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryCommand(command: string, args?: unknown): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(command, args);
    return true;
  } catch {
    return false;
  }
}

async function openCursorComposerWithPrompt(prompt: string): Promise<boolean> {
  const previousClipboard = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(prompt);

  const opened =
    (await tryCommand('composer.newAgentChat')) ||
    (await tryCommand('composer.createNewWithPrevContext')) ||
    (await tryCommand('aichat.newchataction')) ||
    (await tryCommand('workbench.action.chat.open'));

  if (!opened) {
    await vscode.env.clipboard.writeText(previousClipboard);
    return false;
  }

  await sleep(150);
  await tryCommand('editor.action.clipboardPasteAction');
  return true;
}

async function openCopilotChatWithPrompt(prompt: string): Promise<boolean> {
  if (await tryCommand('workbench.action.chat.open', { query: prompt })) {
    return true;
  }
  if (await tryCommand('workbench.action.chat.open', prompt)) {
    return true;
  }
  if (await tryCommand('github.copilot.interactiveSession.open', { query: prompt })) {
    return true;
  }
  return openCursorComposerWithPrompt(prompt);
}

async function openContinueWithPrompt(prompt: string): Promise<boolean> {
  await vscode.env.clipboard.writeText(prompt);
  if (await tryCommand('continue.focusContinueInputWithoutClear')) {
    return true;
  }
  if (await tryCommand('continue.newSession')) {
    await sleep(120);
    return tryCommand('editor.action.clipboardPasteAction');
  }
  return false;
}

async function openClineWithPrompt(prompt: string): Promise<boolean> {
  await vscode.env.clipboard.writeText(prompt);
  if (await tryCommand('cline.openChat')) {
    await sleep(120);
    return tryCommand('editor.action.clipboardPasteAction');
  }
  return false;
}

export async function launchAiAgent(agent: AiAgentOption, prompt: string): Promise<{
  copied: boolean;
  opened: boolean;
  agentLabel: string;
}> {
  if (agent.id === 'copy') {
    await vscode.env.clipboard.writeText(prompt);
    return { copied: true, opened: false, agentLabel: agent.label };
  }

  await vscode.env.clipboard.writeText(prompt);

  let opened = false;
  switch (agent.id) {
    case 'cursor':
      opened = await openCursorComposerWithPrompt(prompt);
      break;
    case 'copilot':
    case 'vscode-chat':
      opened = await openCopilotChatWithPrompt(prompt);
      break;
    case 'continue':
      opened = await openContinueWithPrompt(prompt);
      break;
    case 'cline':
      opened = await openClineWithPrompt(prompt);
      break;
    default:
      opened = false;
  }

  return { copied: true, opened, agentLabel: agent.label };
}

export async function copyOrOpenAiPrompt(prompt: string): Promise<void> {
  const available = getAvailableAiAgents().filter((agent) => agent.id !== 'copy');
  const withCopy = getAvailableAiAgents();
  const agent = await resolveAiAgentChoice(available.length > 0 ? available : withCopy);

  if (!agent) {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'AI prompt copied to clipboard. Paste it into your AI chat (Cursor, Copilot, Claude, etc.).'
    );
    return;
  }

  const result = await launchAiAgent(agent, prompt);

  if (result.opened) {
    vscode.window.showInformationMessage(
      `Task prompt sent to ${result.agentLabel}. Review and submit in the chat panel.`
    );
    return;
  }

  vscode.window.showInformationMessage(
    `Prompt copied to clipboard. Open ${result.agentLabel} and paste (Cmd/Ctrl+V).`
  );
}

export async function copyAiPrompt(prompt: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  vscode.window.showInformationMessage('AI implementation prompt copied to clipboard.');
}
