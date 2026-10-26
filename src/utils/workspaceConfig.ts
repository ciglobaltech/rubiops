import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface RubiOpsProjectConfig {
  projectCode: string;
  name?: string;
  role?: 'DEVELOPER' | 'QA_ENGINEER' | 'TEAM_LEAD' | 'ENTERPRISE_ADMIN';
  roleTitle?: string;
  userEmail?: string;
  companyId?: string;
  companyName?: string;
  permissions?: Record<string, boolean>;
  ado?: {
    organizationUrl?: string;
    projectName?: string;
  };
  git?: {
    defaultTargetBranch?: string;
    branchPattern?: string;
  };
  testing?: {
    prodUrl?: string;
    loginMobile?: string;
    loginPassword?: string;
  };
  leads?: Array<{ name?: string; email?: string }>;
  updatedAt?: string;
}

export type SmartGenieProjectConfig = RubiOpsProjectConfig;

const CONFIG_FILE_NAME = '.rubiops.json';
const LEGACY_CONFIG_FILE_NAME = '.smartgenie.json';

export function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

export function loadWorkspaceProjectConfig(): RubiOpsProjectConfig | undefined {
  const root = getWorkspaceRoot();
  if (!root) {
    return undefined;
  }

  const primaryPath = path.join(root, CONFIG_FILE_NAME);
  const legacyPath = path.join(root, LEGACY_CONFIG_FILE_NAME);
  const filePath = fs.existsSync(primaryPath) ? primaryPath : fs.existsSync(legacyPath) ? legacyPath : undefined;

  if (!filePath) {
    // Check if configured in workspace settings
    const code = vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .get<string>('projectCode')
      ?.trim();
    if (code) {
      return { projectCode: code };
    }
    return undefined;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.projectCode === 'string') {
      return parsed as RubiOpsProjectConfig;
    }
  } catch (err) {
    console.warn('[RubiOps] Failed to parse project config:', err);
  }
  return undefined;
}

export function saveWorkspaceProjectConfig(config: RubiOpsProjectConfig): boolean {
  const root = getWorkspaceRoot();
  if (!root) {
    return false;
  }

  const filePath = path.join(root, CONFIG_FILE_NAME);
  try {
    config.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[RubiOps] Failed to write .rubiops.json:', err);
    return false;
  }
}

export function getActiveProjectCode(): string {
  const config = loadWorkspaceProjectConfig();
  if (config?.projectCode) {
    return config.projectCode.trim();
  }
  const fromSettings = vscode.workspace
    .getConfiguration('devopsQuickUpdate')
    .get<string>('projectCode', '')
    ?.trim();
  return fromSettings || 'DEFAULT';
}

export const DEFAULT_HUB_API_URL = 'http://staging.rupos.app/AI/index.php/v1';

export function normalizeHubApiUrl(rawUrl?: string): string {
  let url = (rawUrl || '').trim().replace(/\/$/, '');
  if (!url) {
    return DEFAULT_HUB_API_URL;
  }
  if (!url.endsWith('/v1')) {
    if (!url.includes('index.php')) {
      url = `${url}/index.php/v1`;
    } else {
      url = `${url}/v1`;
    }
  }
  return url;
}

