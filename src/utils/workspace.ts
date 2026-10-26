import * as crypto from 'crypto';
import * as vscode from 'vscode';

export function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

export function getWorkspaceKey(): string {
  const folder = getActiveWorkspaceFolder();
  if (!folder) {
    return 'global';
  }
  return crypto.createHash('sha256').update(folder.uri.fsPath).digest('hex').slice(0, 16);
}

export function getWorkspaceLabel(): string {
  const folder = getActiveWorkspaceFolder();
  if (!folder) {
    return 'No workspace folder';
  }
  return folder.name;
}

export function getWorkspacePath(): string | undefined {
  return getActiveWorkspaceFolder()?.uri.fsPath;
}
