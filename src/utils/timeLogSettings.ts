import * as vscode from 'vscode';
import { isResolvedCategory } from './workItemStatus';

export function isTimeLogEnabled(): boolean {
  return vscode.workspace.getConfiguration('devopsQuickUpdate').get<boolean>('timeLog.enabled', true);
}

export function isTimeLogRequired(): boolean {
  return vscode.workspace.getConfiguration('devopsQuickUpdate').get<boolean>('timeLog.required', true);
}

export function shouldPromptTimeLog(newState: string, newStateCategory?: string): boolean {
  if (!isTimeLogEnabled()) {
    return false;
  }

  const onCompleteOnly = vscode.workspace
    .getConfiguration('devopsQuickUpdate')
    .get<boolean>('timeLog.onCompleteOnly', false);

  if (!onCompleteOnly) {
    return true;
  }

  return (
    isResolvedCategory(newStateCategory ?? '') ||
    /complete|done|resolved|closed/i.test(newState)
  );
}
