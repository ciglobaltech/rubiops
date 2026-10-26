import * as vscode from 'vscode';
import { PanelBundle } from './panelBundle';
import { COMMANDS } from './utils/constants';

let panels: PanelBundle | undefined;
let navigationRefresh: (() => void) | undefined;

export function setExtensionPanels(bundle: PanelBundle): void {
  panels = bundle;
}

export function setNavigationRefresh(handler: () => void): void {
  navigationRefresh = handler;
}

export async function runRefreshAll(): Promise<void> {
  if (!panels) {
    vscode.window.showWarningMessage('RubiOps is still starting. Try refresh again in a moment.');
    return;
  }

  await panels.dashboardPanel.refresh();
  await panels.tasksListPanel.refresh();
  await panels.queryPanel.refresh();
  await panels.taskBotPanel.refresh();
  panels.tasksTreeProvider.refresh();
  navigationRefresh?.();
}

export function registerCoreCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.REFRESH, () => runRefreshAll())
  );
}

export function logActivationError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`RubiOps activation error: ${message}`);
  void vscode.window.showErrorMessage(
    `RubiOps failed to start: ${message}. Try reloading the window.`
  );
}
