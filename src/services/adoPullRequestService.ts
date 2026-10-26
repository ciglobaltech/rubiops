import { AzureDevOpsClient } from '../azure/azureDevOpsClient';

export interface ParsedAdoGitRemote {
  organization: string;
  project: string;
  repository: string;
}

export interface CreatePullRequestInput {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  workItemId?: number;
}

export interface CreatePullRequestResult {
  id: number;
  url: string;
  title: string;
}

/**
 * Parse common Azure DevOps remote URL shapes into org/project/repo.
 */
export function parseAdoGitRemote(remoteUrl: string): ParsedAdoGitRemote | undefined {
  const trimmed = remoteUrl.trim().replace(/\.git$/i, '');

  // https://dev.azure.com/{org}/{project}/_git/{repo}
  // https://{org}@dev.azure.com/{org}/{project}/_git/{repo}
  const https = trimmed.match(
    /(?:https?:\/\/)(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i
  );
  if (https) {
    return {
      organization: decodeURIComponent(https[1]),
      project: decodeURIComponent(https[2]),
      repository: decodeURIComponent(https[3]),
    };
  }

  // https://{org}.visualstudio.com/{project}/_git/{repo}
  const vs = trimmed.match(
    /(?:https?:\/\/)([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/?#]+)/i
  );
  if (vs) {
    return {
      organization: decodeURIComponent(vs[1]),
      project: decodeURIComponent(vs[2]),
      repository: decodeURIComponent(vs[3]),
    };
  }

  // git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  const ssh = trimmed.match(/ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/?#]+)/i);
  if (ssh) {
    return {
      organization: decodeURIComponent(ssh[1]),
      project: decodeURIComponent(ssh[2]),
      repository: decodeURIComponent(ssh[3]),
    };
  }

  return undefined;
}

export class AdoPullRequestService {
  constructor(private readonly client: AzureDevOpsClient) {}

  async createPullRequest(
    remote: ParsedAdoGitRemote,
    input: CreatePullRequestInput
  ): Promise<CreatePullRequestResult> {
    const sourceRef = input.sourceBranch.startsWith('refs/')
      ? input.sourceBranch
      : `refs/heads/${input.sourceBranch}`;
    const targetRef = input.targetBranch.startsWith('refs/')
      ? input.targetBranch
      : `refs/heads/${input.targetBranch}`;

    const body: Record<string, unknown> = {
      sourceRefName: sourceRef,
      targetRefName: targetRef,
      title: input.title,
      description: input.description,
    };

    if (input.workItemId) {
      body.workItemRefs = [{ id: String(input.workItemId) }];
    }

    const response = await this.client.createGitPullRequest(
      remote.project,
      remote.repository,
      body
    );

    return {
      id: response.pullRequestId,
      url: response.url,
      title: response.title,
    };
  }
}
