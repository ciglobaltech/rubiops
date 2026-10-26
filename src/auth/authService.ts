import * as vscode from 'vscode';
import { getWorkspaceKey, getWorkspaceLabel, getActiveWorkspaceFolder } from '../utils/workspace';
import { normalizeOrganizationUrl, validateOrganizationUrl } from '../utils/url';
import {
  formatPatScopesForUi,
  openPatHelpPage,
  PAT_SETUP_STEPS,
} from '../utils/connectGuide';

function patSecretKey(workspaceKey: string): string {
  return `devopsQuickUpdate.pat.${workspaceKey}`;
}

export class AuthService {
  constructor(private readonly secretStorage: vscode.SecretStorage) {}

  getWorkspaceKey(): string {
    return getWorkspaceKey();
  }

  getWorkspaceLabel(): string {
    return getWorkspaceLabel();
  }

  async getPat(): Promise<string | undefined> {
    const key = patSecretKey(getWorkspaceKey());
    const workspacePat = await this.secretStorage.get(key);
    if (workspacePat) {
      return workspacePat;
    }
    return this.secretStorage.get('devopsQuickUpdate.pat');
  }

  async setPat(pat: string): Promise<void> {
    const key = patSecretKey(getWorkspaceKey());
    await this.secretStorage.store(key, pat);
  }

  async clearPat(): Promise<void> {
    const key = patSecretKey(getWorkspaceKey());
    await this.secretStorage.delete(key);
  }

  getOrganizationUrl(): string | undefined {
    const url = vscode.workspace.getConfiguration('devopsQuickUpdate').get<string>('organizationUrl');
    return url?.trim() || undefined;
  }

  getProjectName(): string | undefined {
    const project = vscode.workspace.getConfiguration('devopsQuickUpdate').get<string>('projectName');
    return project?.trim() || undefined;
  }

  async setOrganizationUrl(url: string): Promise<void> {
    const normalized = normalizeOrganizationUrl(url);
    await vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .update('organizationUrl', normalized, vscode.ConfigurationTarget.Workspace);
  }

  async setProjectName(project: string): Promise<void> {
    await vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .update('projectName', project.trim(), vscode.ConfigurationTarget.Workspace);
  }

  async isAuthenticated(): Promise<boolean> {
    const pat = await this.getPat();
    const orgUrl = this.getOrganizationUrl();
    return Boolean(pat && orgUrl);
  }

  async showConnectionGuide(): Promise<void> {
    const steps = PAT_SETUP_STEPS.map((step, index) => `${index + 1}. ${step}`).join('\n');
    const choice = await vscode.window.showInformationMessage(
      `How to connect RubiOps:\n\n${steps}\n\nRequired PAT scopes: ${formatPatScopesForUi()}`,
      { modal: true },
      'Open PAT Help',
      'Start Connect'
    );

    if (choice === 'Open PAT Help') {
      await openPatHelpPage(this.getOrganizationUrl());
    }
  }

  async promptForCredentials(): Promise<boolean> {
    if (!getActiveWorkspaceFolder()) {
      const choice = await vscode.window.showWarningMessage(
        'Open a project folder first (File → Open Folder). RubiOps stores your Azure DevOps connection per workspace folder.',
        'Open Folder',
        'How to get PAT'
      );
      if (choice === 'Open Folder') {
        await vscode.commands.executeCommand('vscode.openFolder');
      } else if (choice === 'How to get PAT') {
        await openPatHelpPage();
      }
      return false;
    }

    const workspaceLabel = getWorkspaceLabel();

    const intro = await vscode.window.showInformationMessage(
      `Connect RubiOps to Azure DevOps for "${workspaceLabel}". You will enter: (1) organization URL, (2) PAT token, (3) project name.`,
      { modal: true },
      'Start',
      'How to get PAT'
    );

    if (intro === 'How to get PAT') {
      await openPatHelpPage(this.getOrganizationUrl());
      return this.promptForCredentials();
    }
    if (intro !== 'Start') {
      return false;
    }

    const orgUrl = await vscode.window.showInputBox({
      title: `Step 1 of 3 — Organization URL (${workspaceLabel})`,
      prompt: 'Paste your Azure DevOps organization URL',
      placeHolder: 'https://dev.azure.com/YourOrg',
      value: this.getOrganizationUrl() ?? 'https://dev.azure.com/',
      ignoreFocusOut: true,
      validateInput: (value) => validateOrganizationUrl(value),
    });

    if (!orgUrl) {
      return false;
    }

    const patChoice = await vscode.window.showInformationMessage(
      `Step 2 of 3 — Create a Personal Access Token in Azure DevOps.\n\nRequired scopes:\n• ${formatPatScopesForUi().replace(/ · /g, '\n• ')}\n\nOpen the PAT page for your org, create a token, and copy it.`,
      { modal: true },
      'Open PAT Page',
      'I have my PAT'
    );

    if (patChoice === 'Open PAT Page') {
      await openPatHelpPage(orgUrl);
    } else if (patChoice !== 'I have my PAT') {
      return false;
    }

    const pat = await vscode.window.showInputBox({
      title: `Step 2 of 3 — Paste PAT (${workspaceLabel})`,
      prompt: 'Paste the token you copied from Azure DevOps (shown only once when created)',
      placeHolder: `Scopes: ${formatPatScopesForUi()}`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? null : 'PAT is required'),
    });

    if (!pat) {
      return false;
    }

    const projectName = await vscode.window.showInputBox({
      title: `Step 3 of 3 — Project name (${workspaceLabel})`,
      prompt: 'Default Azure DevOps project for dashboard and search (recommended)',
      placeHolder: 'e.g. MyProject',
      value: this.getProjectName() ?? '',
      ignoreFocusOut: true,
    });

    if (projectName === undefined) {
      return false;
    }

    await this.setOrganizationUrl(orgUrl);
    if (projectName.trim()) {
      await this.setProjectName(projectName);
    }
    await this.setPat(pat.trim());
    return true;
  }
}
