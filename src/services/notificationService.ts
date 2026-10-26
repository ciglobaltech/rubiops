import * as vscode from 'vscode';
import { COMMANDS } from '../utils/constants';

export class NotificationService {
  /** Fire-and-forget toast — does not wait for clicks (no developer input). */
  toast(message: string): void {
    void vscode.window.showInformationMessage(message);
  }

  async info(
    message: string,
    options?: { workItemId?: number; openDashboard?: boolean }
  ): Promise<void> {
    if (!options?.workItemId && !options?.openDashboard) {
      this.toast(message);
      return;
    }

    const actions: string[] = [];
    if (options?.workItemId !== undefined) {
      actions.push('Open work item');
    }
    if (options?.openDashboard) {
      actions.push('Open dashboard');
    }

    const choice = await vscode.window.showInformationMessage(message, ...actions);
    if (choice === 'Open work item' && options?.workItemId !== undefined) {
      await vscode.commands.executeCommand(COMMANDS.OPEN_WORK_ITEM, options.workItemId);
    }
    if (choice === 'Open dashboard') {
      await vscode.commands.executeCommand(COMMANDS.OPEN_DASHBOARD);
    }
  }

  async warn(message: string, _workItemId?: number): Promise<void> {
    void vscode.window.showWarningMessage(message);
  }

  async error(message: string): Promise<void> {
    void vscode.window.showErrorMessage(message);
  }
}
