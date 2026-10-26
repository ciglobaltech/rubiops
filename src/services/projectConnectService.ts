import * as vscode from 'vscode';
import axios from 'axios';
import {
  saveWorkspaceProjectConfig,
  loadWorkspaceProjectConfig,
  RubiOpsProjectConfig,
  normalizeHubApiUrl,
} from '../utils/workspaceConfig';

export class ProjectConnectService {
  constructor(private readonly output: vscode.OutputChannel) {}

  private getHubApiUrl(): string {
    const configured = vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .get<string>('hub.apiUrl', 'http://staging.rupos.app/AI/index.php/v1');
    return normalizeHubApiUrl(configured);
  }

  async promptAndConnect(presetCode?: string): Promise<boolean> {
    const existing = loadWorkspaceProjectConfig();
    const defaultVal = presetCode || existing?.projectCode || '';

    const code = await vscode.window.showInputBox({
      title: 'RubiOps — Connect with Project Code',
      prompt: 'Enter your Unique Company Project Code (e.g. RO-CORE-1001 or SG-CORE-1001)',
      value: defaultVal,
      placeHolder: 'RO-XXXX-####',
      ignoreFocusOut: true,
      validateInput: (text) => {
        if (!text || !text.trim()) {
          return 'Project code cannot be empty.';
        }
        return null;
      },
    });

    if (!code || !code.trim()) {
      return false;
    }

    const cleanCode = code.trim().toUpperCase();

    // Optionally ask for / confirm work email to resolve role
    const defaultEmail = existing?.userEmail || '';
    const email = await vscode.window.showInputBox({
      title: 'RubiOps — Your Team Work Email',
      prompt: 'Enter your work email to automatically resolve your role (Developer, QA, Team Lead)',
      value: defaultEmail,
      placeHolder: 'you@company.com',
      ignoreFocusOut: true,
    });

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Verifying project code "${cleanCode}" with RubiOps Hub...`,
      },
      async () => {
        return await this.verifyAndApply(cleanCode, email?.trim());
      }
    );
  }

  async verifyAndApply(projectCode: string, userEmail?: string): Promise<boolean> {
    const hubUrl = this.getHubApiUrl();
    const verifyUrl = `${hubUrl}/projects/verify`;

    try {
      this.output.appendLine(`[ProjectConnect] Verifying code "${projectCode}" (email: ${userEmail || 'anonymous'}) via ${verifyUrl}`);
      const res = await axios.post(
        verifyUrl,
        { projectCode, email: userEmail || '' },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );

      if (!res.data || !res.data.ok || !res.data.project) {
        vscode.window.showErrorMessage(
          `Project verification failed: ${res.data?.message || 'Invalid project code'}`
        );
        return false;
      }

      const p = res.data.project;
      const role = res.data.role || p.userRole || 'DEVELOPER';
      const roleTitle = res.data.roleTitle || p.userRoleTitle || 'Software Engineer';
      const permissions = res.data.permissions || p.permissions || {};

      const config: RubiOpsProjectConfig = {
        projectCode: p.projectCode || projectCode,
        name: p.name,
        role,
        roleTitle,
        userEmail: userEmail || undefined,
        permissions,
        companyName: p.companyName,
        companyId: p.companyId,
        ado: {
          organizationUrl: p.adoOrgUrl,
          projectName: p.adoProject,
        },
        git: {
          defaultTargetBranch: p.defaultTargetBranch || 'dev',
        },
        testing: {
          prodUrl: p.environments?.preprodUrl,
        },
        leads: p.reviewers,
      };

      const saved = saveWorkspaceProjectConfig(config);
      if (!saved) {
        vscode.window.showErrorMessage(
          'Failed to write .rubiops.json to the workspace root. Ensure a project folder is open.'
        );
        return false;
      }

      // Also set workspace-level VS Code configuration
      const wsConfig = vscode.workspace.getConfiguration('devopsQuickUpdate');
      if (p.adoOrgUrl) {
        await wsConfig.update(
          'organizationUrl',
          p.adoOrgUrl,
          vscode.ConfigurationTarget.Workspace
        );
      }
      if (p.adoProject) {
        await wsConfig.update('projectName', p.adoProject, vscode.ConfigurationTarget.Workspace);
      }
      await wsConfig.update('projectCode', config.projectCode, vscode.ConfigurationTarget.Workspace);

      vscode.window.showInformationMessage(
        `✓ Connected to "${config.name || config.projectCode}" as ${roleTitle}! Workspace configured.`
      );
      this.output.appendLine(
        `[ProjectConnect] Successfully paired with project: ${config.name} (${config.projectCode}) as ${roleTitle}`
      );

      return true;
    } catch (err: unknown) {
      let msg = 'Network error connecting to RubiOps Hub';
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error || err.response?.data?.message || err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }

      // Fallback for offline usage: allow user to save code directly offline!
      const offlineChoice = await vscode.window.showWarningMessage(
        `Could not reach Hub (${msg}). Would you like to save "${projectCode}" offline in .rubiops.json?`,
        'Save Offline',
        'Cancel'
      );

      if (offlineChoice === 'Save Offline') {
        const config: RubiOpsProjectConfig = {
          projectCode,
        };
        saveWorkspaceProjectConfig(config);
        vscode.window.showInformationMessage(
          `Project code "${projectCode}" saved locally in .rubiops.json.`
        );
        return true;
      }

      return false;
    }
  }
}
