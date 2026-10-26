import * as vscode from 'vscode';
import { extractOrganizationName } from './url';

export const PAT_SETUP_STEPS = [
  'Open Azure DevOps in your browser and sign in.',
  'Click your profile (top right) → Personal access tokens.',
  'Select + New Token, name it (e.g. RubiOps), choose an expiration.',
  'Scopes: Work Items (Read & write), Code (Read & write for Auto Code Fix PRs), Project and Team (Read), Member Entitlement Management (Read).',
  'Create the token and copy it immediately — you will not see it again.',
  'Return here and click Connect. Paste the org URL and PAT when prompted.',
] as const;

export const GENERIC_PAT_DOCS_URL =
  'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate';

export function getPatTokensPageUrl(orgUrl?: string): string {
  if (!orgUrl?.trim()) {
    return GENERIC_PAT_DOCS_URL;
  }
  try {
    const orgName = extractOrganizationName(orgUrl);
    return `https://dev.azure.com/${orgName}/_usersSettings/tokens`;
  } catch {
    return GENERIC_PAT_DOCS_URL;
  }
}

export async function openPatHelpPage(orgUrl?: string): Promise<void> {
  const url = getPatTokensPageUrl(orgUrl);
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

export function formatPatScopesForUi(): string {
  return [
    'Work Items — Read & write',
    'Code — Read & write (Auto Code Fix PRs)',
    'Project and Team — Read',
    'Member Entitlement Management — Read',
  ].join(' · ');
}
