import * as vscode from 'vscode';
import { WorkItem } from '../models/workItem';
import { isResolvedCategory } from '../utils/workItemStatus';
import { isTimeLogRequired, shouldPromptTimeLog } from '../utils/timeLogSettings';

export interface TimeLogInput {
  hoursSpent: number;
  newCompletedWork: number;
  remainingWork?: number;
}

export class TimeLogService {
  shouldPrompt(newState: string, newStateCategory?: string): boolean {
    return shouldPromptTimeLog(newState, newStateCategory);
  }

  async promptForHours(
    workItem: WorkItem,
    newState: string,
    newStateCategory?: string
  ): Promise<TimeLogInput | undefined> {
    if (!this.shouldPrompt(newState, newStateCategory)) {
      return { hoursSpent: 0, newCompletedWork: workItem.completedWork ?? 0 };
    }

    const isCompleting =
      isResolvedCategory(newStateCategory ?? '') ||
      /complete|done|resolved|closed/i.test(newState);

    const current = workItem.completedWork ?? 0;
    const currentLabel =
      current > 0 ? ` (current Completed Work: ${current}h)` : '';

    const required = isTimeLogRequired();
    const value = await vscode.window.showInputBox({
      title: 'Log Time — RubiOps',
      prompt: `Enter hours spent on #${workItem.id} for status change to "${newState}"${currentLabel}`,
      placeHolder: required ? 'e.g. 1.5' : 'e.g. 1.5 (leave empty to skip)',
      validateInput: (input) => {
        const trimmed = input.trim();
        if (!trimmed) {
          return required ? 'Hours are required when changing status' : null;
        }
        const hours = parseFloat(trimmed);
        if (Number.isNaN(hours) || hours < 0) {
          return 'Enter a valid number of hours (0 or more)';
        }
        if (hours > 24) {
          return 'Enter hours for this session (24h max per entry)';
        }
        return null;
      },
      ignoreFocusOut: true,
    });

    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return { hoursSpent: 0, newCompletedWork: current };
    }

    const hoursSpent = parseFloat(trimmed);
    const newCompletedWork = Math.round((current + hoursSpent) * 100) / 100;

    return {
      hoursSpent,
      newCompletedWork,
      remainingWork: isCompleting ? 0 : undefined,
    };
  }
}
