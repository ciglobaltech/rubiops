/**
 * Talks to an AI the developer already installed and returns the text.
 * Nothing here opens the Cursor, Copilot, or Claude chat panel.
 */

import * as vscode from 'vscode';
import { SECRET_KEYS } from '../utils/constants';
import { getWorkspacePath } from '../utils/workspace';

export interface AgentPlatform {
  id: string;
  label: string;
  kind: 'model' | 'cursor';
  vendor?: string;
  family?: string;
  modelId?: string;
}

const INSTALLED: Array<{ extensionIds: string[]; label: string; vendors: string[] }> = [
  { extensionIds: ['GitHub.copilot-chat', 'GitHub.copilot'], label: 'GitHub Copilot', vendors: ['copilot'] },
  { extensionIds: ['Anthropic.claude-code'], label: 'Claude', vendors: ['anthropic', 'claude', 'claude-code'] },
  { extensionIds: ['Continue.continue'], label: 'Continue', vendors: ['continue'] },
  { extensionIds: ['saoudrizwan.claude-dev'], label: 'Cline', vendors: ['cline'] },
];

export async function listAgentPlatforms(): Promise<AgentPlatform[]> {
  const platforms: AgentPlatform[] = [];
  const seen = new Set<string>();

  let models: vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels();
  } catch {
    models = [];
  }

  for (const model of models) {
    const id = `model:${model.vendor}:${model.family}:${model.id}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    platforms.push({
      id,
      label: `${vendorLabel(model.vendor)} · ${model.name || model.family}`,
      kind: 'model',
      vendor: model.vendor,
      family: model.family,
      modelId: model.id,
    });
  }

  for (const entry of INSTALLED) {
    if (!entry.extensionIds.some((extensionId) => vscode.extensions.getExtension(extensionId))) {
      continue;
    }
    const covered = models.some((model) => entry.vendors.some((vendor) => vendorMatches(model.vendor, vendor)));
    if (covered) {
      continue;
    }
    const id = `ext:${entry.vendors[0]}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    platforms.push({
      id,
      label: entry.label,
      kind: 'model',
      vendor: entry.vendors[0],
    });
  }

  const hasCursorModel = platforms.some((platform) => /cursor/i.test(`${platform.vendor ?? ''} ${platform.label}`));
  if (isCursorApp() && !hasCursorModel) {
    platforms.unshift({ id: 'cursor', label: 'Cursor', kind: 'cursor' });
  }

  return platforms;
}

export function choosePlatform(platforms: AgentPlatform[], selectedId: string | undefined): AgentPlatform | undefined {
  if (platforms.length === 0) {
    return undefined;
  }
  return platforms.find((platform) => platform.id === selectedId) ?? platforms[0];
}

export async function askAgentPlatform(
  platform: AgentPlatform,
  prompt: string,
  secrets: vscode.SecretStorage,
  onDelta?: (text: string) => void
): Promise<string> {
  if (platform.kind === 'cursor' && platform.id === 'cursor') {
    return askCursor(prompt, secrets, onDelta);
  }
  return askLanguageModel(platform, prompt, onDelta);
}

async function askLanguageModel(
  platform: AgentPlatform,
  prompt: string,
  onDelta?: (text: string) => void
): Promise<string> {
  const selector: vscode.LanguageModelChatSelector = {};
  if (platform.modelId) {
    selector.id = platform.modelId;
    selector.vendor = platform.vendor;
    selector.family = platform.family;
  } else if (platform.vendor) {
    selector.vendor = platform.vendor;
  }

  const models = await vscode.lm.selectChatModels(selector);
  const model =
    (platform.modelId ? models.find((item) => item.id === platform.modelId) : undefined) ?? pickModel(models);
  if (!model) {
    throw new Error(
      `${platform.label} is installed, but it has not shared a model with RubiOps. Sign in to that extension, then send the question again.`
    );
  }

  let response: vscode.LanguageModelChatResponse;
  try {
    response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {
        justification: 'RubiOps Agent shows the answer in its own window using the AI you already signed in to.',
      }
    );
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code === 'NoPermissions') {
      throw new Error(`Allow RubiOps to use ${model.name} when the prompt appears, then send the question again.`);
    }
    const message = error instanceof Error ? error.message : 'The AI request failed.';
    throw new Error(message);
  }

  let text = '';
  for await (const chunk of response.text) {
    text += chunk;
    onDelta?.(text);
  }
  const answer = text.trim();
  if (!answer) {
    throw new Error(`${model.name} returned an empty answer.`);
  }
  return answer;
}

async function askCursor(
  prompt: string,
  secrets: vscode.SecretStorage,
  onDelta?: (text: string) => void
): Promise<string> {
  let apiKey = await secrets.get(SECRET_KEYS.CURSOR_API_KEY);
  if (!apiKey) {
    const entered = await vscode.window.showInputBox({
      title: 'Cursor API key',
      prompt: 'RubiOps uses this key to get the answer in this window. It does not open the Cursor chat.',
      password: true,
      ignoreFocusOut: true,
    });
    if (!entered?.trim()) {
      throw new Error('A Cursor API key is required to answer in this window.');
    }
    apiKey = entered.trim();
    await secrets.store(SECRET_KEYS.CURSOR_API_KEY, apiKey);
  }

  const modelId = vscode.workspace.getConfiguration('devopsQuickUpdate').get<string>('autoFix.model', 'composer-2.5');
  const cwd = getWorkspacePath();
  const sdk = (await import('@cursor/sdk')) as {
    Agent: {
      prompt: (
        message: string,
        options?: { apiKey?: string; model?: { id: string }; local?: { cwd?: string } }
      ) => Promise<{ status?: string; result?: string }>;
    };
  };

  const result = await sdk.Agent.prompt(prompt, {
    apiKey,
    model: { id: modelId },
    local: cwd ? { cwd } : undefined,
  });
  if (result.status === 'error') {
    throw new Error(result.result || 'Cursor did not return an answer.');
  }
  const answer = (result.result || '').trim();
  if (!answer) {
    throw new Error('Cursor returned an empty answer.');
  }
  onDelta?.(answer);
  return answer;
}

function pickModel(models: vscode.LanguageModelChat[]): vscode.LanguageModelChat | undefined {
  if (models.length === 0) {
    return undefined;
  }
  return [...models].sort((left, right) => scoreModel(right) - scoreModel(left))[0];
}

function scoreModel(model: vscode.LanguageModelChat): number {
  const name = `${model.name} ${model.family} ${model.id}`.toLowerCase();
  let score = model.maxInputTokens || 0;
  if (/mini|nano|flash|haiku/.test(name)) {
    score -= 80_000;
  }
  if (/gpt-4o|gpt-4|sonnet|opus|claude/.test(name)) {
    score += 100_000;
  }
  return score;
}

function vendorLabel(vendor: string): string {
  if (/copilot/i.test(vendor)) {
    return 'GitHub Copilot';
  }
  if (/anthropic|claude/i.test(vendor)) {
    return 'Claude';
  }
  if (/continue/i.test(vendor)) {
    return 'Continue';
  }
  if (/cursor/i.test(vendor)) {
    return 'Cursor';
  }
  if (/cline/i.test(vendor)) {
    return 'Cline';
  }
  return vendor;
}

function vendorMatches(actual: string, expected: string): boolean {
  return actual.toLowerCase().includes(expected.toLowerCase());
}

function isCursorApp(): boolean {
  return /cursor/i.test(vscode.env.appName);
}
