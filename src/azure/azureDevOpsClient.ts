import axios, { AxiosError, AxiosInstance } from 'axios';
import { WorkItem, WorkItemSummary } from '../models/workItem';
import { WorkItemTypeState } from '../models/workItemState';
import { ProjectMember } from '../models/projectMember';
import { WorkItemComment } from '../models/workItemComment';
import { AreaOption, IterationOption, ProjectOption, WorkItemListItem } from '../models/query';
import { RawDashboardItem, resolveStateCategory } from '../services/dashboardService';
import { extractOrganizationName } from '../utils/url';
import { formatPatScopeHint } from '../utils/patScopes';
import { DASHBOARD_QUERY_TOP, SEARCH_QUERY_TOP, optimizeWiql } from '../services/queryOptimizer';

const LIST_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.TeamProject',
  'System.IterationPath',
  'System.ChangedDate',
  'Microsoft.VSTS.Scheduling.DueDate',
  'Microsoft.VSTS.Scheduling.TargetDate',
];

const DASHBOARD_FIELDS = [
  ...LIST_FIELDS,
  'System.AreaPath',
  'System.AssignedTo',
  'System.Tags',
  'Microsoft.VSTS.Common.Priority',
];

const PREVIEW_FIELDS = [...LIST_FIELDS, 'System.Description'];

export interface AdoSprintDetails {
  id: string;
  name: string;
  path: string;
  startDate?: string;
  finishDate?: string;
  timeFrame?: string;
  teamName?: string;
}

interface WiqlResponse {
  workItems: Array<{ id: number }>;
}

interface ClassificationNode {
  id: number;
  name: string;
  structureType: string;
  hasChildren: boolean;
  path?: string;
  children?: ClassificationNode[];
}

interface WorkItemBatchResponse {
  value: Array<{
    id: number;
    fields: Record<string, unknown>;
    url: string;
    relations?: Array<{
      rel: string;
      url: string;
      attributes?: { name?: string };
    }>;
  }>;
}

interface SingleWorkItemResponse {
  id: number;
  fields: Record<string, unknown>;
  url: string;
  relations?: Array<{
    rel: string;
    url: string;
    attributes?: { name?: string };
  }>;
}

interface WorkItemTypeStatesResponse {
  value: WorkItemTypeState[];
}

interface IdentityResponse {
  authenticatedUser: {
    id: string;
    descriptor: string;
    providerDisplayName: string;
  };
}

interface CommentsResponse {
  totalCount: number;
  comments: Array<{
    id: number;
    text: string;
    createdBy: { displayName: string };
    createdDate: string;
    modifiedDate?: string;
  }>;
}

export class AzureDevOpsClient {
  private readonly http: AxiosInstance;
  private readonly orgName: string;
  private static readonly WIT_API_VERSION = '7.1';
  private static readonly CONNECTION_API_VERSION = '7.1-preview';

  constructor(organizationUrl: string, pat: string) {
    this.orgName = extractOrganizationName(organizationUrl);
    this.http = axios.create({
      baseURL: `https://dev.azure.com/${this.orgName}`,
      headers: {
        Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  async getCurrentUser(): Promise<string> {
    try {
      const response = await this.http.get<IdentityResponse>(
        `/_apis/connectionData?api-version=${AzureDevOpsClient.CONNECTION_API_VERSION}`
      );
      return response.data.authenticatedUser.providerDisplayName;
    } catch (error) {
      throw new Error(this.toFriendlyError(error, 'verify your organization URL and PAT'));
    }
  }

  async getAssignedWorkItems(): Promise<WorkItemSummary[]> {
    const items = await this.fetchAssignedWorkItemFields();
    const summaries: WorkItemSummary[] = [];
    const typeStateCache = new Map<string, WorkItemTypeState[]>();

    for (const item of items) {
      const project = String(item.fields['System.TeamProject'] ?? '');
      const workItemType = String(item.fields['System.WorkItemType'] ?? 'Task');
      const state = String(item.fields['System.State'] ?? 'Unknown');
      const cacheKey = `${project}:${workItemType}`;

      if (!typeStateCache.has(cacheKey)) {
        const orgStates = await this.getWorkItemTypeStates(project, workItemType);
        typeStateCache.set(cacheKey, orgStates);
      }

      const orgStates = typeStateCache.get(cacheKey) ?? [];
      const stateMeta = orgStates.find((entry) => entry.name === state);
      const isInactive =
        stateMeta?.category === 'Completed' || stateMeta?.category === 'Removed';

      if (isInactive) {
        continue;
      }

      summaries.push({
        id: item.id,
        title: String(item.fields['System.Title'] ?? 'Untitled'),
        state,
        workItemType,
        project,
      });
    }

    return summaries;
  }

  async getDashboardItems(): Promise<RawDashboardItem[]> {
    const items = await this.fetchAssignedWorkItemFields();
    const typeStateCache = new Map<string, WorkItemTypeState[]>();
    const dashboardItems: RawDashboardItem[] = [];

    for (const item of items) {
      const project = String(item.fields['System.TeamProject'] ?? '');
      const workItemType = String(item.fields['System.WorkItemType'] ?? 'Task');
      const state = String(item.fields['System.State'] ?? 'Unknown');
      const cacheKey = `${project}:${workItemType}`;

      if (!typeStateCache.has(cacheKey)) {
        const orgStates = await this.getWorkItemTypeStates(project, workItemType);
        typeStateCache.set(cacheKey, orgStates);
      }

      const orgStates = typeStateCache.get(cacheKey) ?? [];
      dashboardItems.push({
        id: item.id,
        title: String(item.fields['System.Title'] ?? 'Untitled'),
        state,
        workItemType,
        project,
        changedDate: String(item.fields['System.ChangedDate'] ?? ''),
        dueDate: item.fields['Microsoft.VSTS.Scheduling.DueDate']
          ? String(item.fields['Microsoft.VSTS.Scheduling.DueDate'])
          : item.fields['Microsoft.VSTS.Scheduling.TargetDate']
            ? String(item.fields['Microsoft.VSTS.Scheduling.TargetDate'])
            : undefined,
        stateCategory: resolveStateCategory(orgStates, state),
        iterationPath: String(item.fields['System.IterationPath'] ?? ''),
        priority:
          item.fields['Microsoft.VSTS.Common.Priority'] != null
            ? String(item.fields['Microsoft.VSTS.Common.Priority'])
            : 'N/A',
        areaPath: String(item.fields['System.AreaPath'] ?? ''),
        assignedTo: String(
          (item.fields['System.AssignedTo'] as { displayName?: string })?.displayName ?? 'Unassigned'
        ),
        tags: String(item.fields['System.Tags'] ?? '')
          .split(';')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    }

    return dashboardItems;
  }

  async getAssignedBugs(): Promise<WorkItem[]> {
    const wiql = optimizeWiql(`
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.AssignedTo] = @Me
        AND [System.WorkItemType] = 'Bug'
        AND [System.State] <> 'Removed'
      ORDER BY [System.ChangedDate] DESC
    `);

    const queryResponse = await this.http.post<WiqlResponse>(this.wiqlUrl(), { query: wiql });

    const ids = queryResponse.data.workItems.map((item) => item.id);
    return this.loadBugsByIds(ids, 200, { includeResolved: false });
  }

  /**
   * Broken-tagged bugs assigned to me — includes Resolved/Closed so Autopilot
   * can still run verify + comments (e.g. #6742 Resolved + Broken).
   */
  async getAssignedBrokenBugs(brokenTag = 'Broken'): Promise<WorkItem[]> {
    const tag = brokenTag.replace(/'/g, "''");
    const wiql = optimizeWiql(`
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.AssignedTo] = @Me
        AND [System.WorkItemType] = 'Bug'
        AND [System.State] <> 'Removed'
        AND [System.Tags] CONTAINS '${tag}'
      ORDER BY [System.ChangedDate] DESC
    `);

    try {
      const queryResponse = await this.http.post<WiqlResponse>(this.wiqlUrl(), { query: wiql });
      const ids = queryResponse.data.workItems.map((item) => item.id);
      return this.loadBugsByIds(ids, 100, { includeResolved: true });
    } catch {
      return [];
    }
  }

  private async loadBugsByIds(
    ids: number[],
    limit: number,
    options?: { includeResolved?: boolean }
  ): Promise<WorkItem[]> {
    const bugs: WorkItem[] = [];
    for (const id of ids.slice(0, limit)) {
      bugs.push(await this.fetchWorkItemFields(id));
    }
    return bugs.filter((bug) => {
      const state = bug.state.toLowerCase();
      if (state === 'removed') {
        return false;
      }
      if (options?.includeResolved) {
        return true;
      }
      return !['done', 'closed', 'resolved', 'completed'].includes(state);
    });
  }

  private async fetchAssignedWorkItemFields(): Promise<WorkItemBatchResponse['value']> {
    const wiql = optimizeWiql(`
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.AssignedTo] = @Me
      ORDER BY [System.ChangedDate] DESC
    `);

    const ids = await this.runWiql(wiql, undefined, DASHBOARD_QUERY_TOP);
    if (ids.length === 0) {
      return [];
    }

    return this.fetchWorkItemsInBatches(ids, DASHBOARD_FIELDS);
  }

  private async fetchWorkItemsInBatches(
    ids: number[],
    fields?: string[]
  ): Promise<WorkItemBatchResponse['value']> {
    const batchSize = 200;
    const results: WorkItemBatchResponse['value'] = [];
    const fieldQuery = fields?.length ? `&fields=${fields.join(',')}` : '&$expand=fields';

    for (let index = 0; index < ids.length; index += batchSize) {
      const batchIds = ids.slice(index, index + batchSize);
      const detailsResponse = await this.http.get<WorkItemBatchResponse>(
        `/_apis/wit/workitems?ids=${batchIds.join(',')}${fieldQuery}&api-version=${AzureDevOpsClient.WIT_API_VERSION}`
      );
      results.push(...detailsResponse.data.value);
    }

    return results;
  }

  async getWorkItem(id: number): Promise<WorkItem> {
    const workItem = await this.fetchWorkItemFields(id);

    if (workItem.parentId) {
      try {
        const parent = await this.fetchWorkItemFields(workItem.parentId);
        workItem.parentTitle = parent.title;
        workItem.parentState = parent.state;
        workItem.parentType = parent.workItemType;
      } catch {
        // Parent details are optional for display.
      }
    }

    return workItem;
  }

  private async fetchWorkItemFields(id: number): Promise<WorkItem> {
    const response = await this.http.get<SingleWorkItemResponse>(
      `/_apis/wit/workitems/${id}?$expand=relations,fields&api-version=${AzureDevOpsClient.WIT_API_VERSION}`
    );

    const fields = response.data.fields;
    const tags = String(fields['System.Tags'] ?? '')
      .split(';')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const descriptionRaw = String(fields['System.Description'] ?? '');
    const reproSteps = String(fields['Microsoft.VSTS.TCM.ReproSteps'] ?? '');
    // Bug forms often put login + steps in Repro Steps, not Description.
    const description =
      descriptionRaw.trim().length > 0
        ? reproSteps.trim().length > 0 && !descriptionRaw.includes(reproSteps.slice(0, 40))
          ? `${descriptionRaw}\n\n${reproSteps}`
          : descriptionRaw
        : reproSteps;

    const workItem: WorkItem = {
      id: response.data.id,
      title: String(fields['System.Title'] ?? 'Untitled'),
      description,
      acceptanceCriteria: readAcceptanceCriteria(fields),
      state: String(fields['System.State'] ?? 'Unknown'),
      priority: fields['Microsoft.VSTS.Common.Priority'] != null
        ? String(fields['Microsoft.VSTS.Common.Priority'])
        : 'N/A',
      areaPath: String(fields['System.AreaPath'] ?? ''),
      iterationPath: String(fields['System.IterationPath'] ?? ''),
      assignedTo: String(
        (fields['System.AssignedTo'] as { displayName?: string })?.displayName ?? 'Unassigned'
      ),
      assignedToUniqueName: (fields['System.AssignedTo'] as { uniqueName?: string })?.uniqueName,
      tags,
      url: response.data.url,
      workItemType: String(fields['System.WorkItemType'] ?? 'Task'),
      project: String(fields['System.TeamProject'] ?? ''),
      dueDate: fields['Microsoft.VSTS.Scheduling.DueDate']
        ? String(fields['Microsoft.VSTS.Scheduling.DueDate'])
        : fields['Microsoft.VSTS.Scheduling.TargetDate']
          ? String(fields['Microsoft.VSTS.Scheduling.TargetDate'])
          : undefined,
      changedDate: String(fields['System.ChangedDate'] ?? ''),
      createdDate: String(fields['System.CreatedDate'] ?? ''),
      completedWork: this.parseNumberField(fields['Microsoft.VSTS.Scheduling.CompletedWork']),
      remainingWork: this.parseNumberField(fields['Microsoft.VSTS.Scheduling.RemainingWork']),
    };

    const parentId = this.extractParentId(response.data.relations);
    if (parentId) {
      workItem.parentId = parentId;
    }

    return workItem;
  }

  async getValidTransitions(
    workItemId: number,
    typeStates: WorkItemTypeState[]
  ): Promise<WorkItemTypeState[]> {
    const workItem = await this.fetchWorkItemFields(workItemId);
    const candidateStates = typeStates.filter((state) => state.name !== workItem.state);

    const validations = await Promise.all(
      candidateStates.map(async (state) => ({
        state,
        isValid: await this.validateStateTransition(workItemId, state.name),
      }))
    );

    return validations.filter((result) => result.isValid).map((result) => result.state);
  }

  private async validateStateTransition(workItemId: number, state: string): Promise<boolean> {
    try {
      await this.http.patch(
        `/_apis/wit/workitems/${workItemId}?validateOnly=true&api-version=${AzureDevOpsClient.WIT_API_VERSION}`,
        [
          {
            op: 'add',
            path: '/fields/System.State',
            value: state,
          },
        ],
        {
          headers: {
            'Content-Type': 'application/json-patch+json',
          },
        }
      );
      return true;
    } catch {
      return false;
    }
  }

  private parseNumberField(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private extractParentId(
    relations?: Array<{ rel: string; url: string }>
  ): number | undefined {
    const parentRelation = relations?.find(
      (relation) => relation.rel === 'System.LinkTypes.Hierarchy-Reverse'
    );
    if (!parentRelation) {
      return undefined;
    }

    const match = parentRelation.url.match(/workitems\/(\d+)$/);
    return match ? Number(match[1]) : undefined;
  }

  async searchWorkItems(
    wiql: string,
    activeOnly = false,
    project?: string,
    top = SEARCH_QUERY_TOP
  ): Promise<WorkItemListItem[]> {
    const ids = await this.runWiql(wiql, project, top);
    if (ids.length === 0) {
      return [];
    }

    const items = await this.fetchWorkItemsInBatches(ids, LIST_FIELDS);
    return this.toListItems(items, activeOnly);
  }

  async searchWorkItemsWithPreview(
    wiql: string,
    activeOnly = false,
    project?: string
  ): Promise<Array<WorkItemListItem & { descriptionPreview?: string }>> {
    const ids = await this.runWiql(wiql, project, SEARCH_QUERY_TOP);
    if (ids.length === 0) {
      return [];
    }

    const details = await this.fetchWorkItemsInBatches(ids, PREVIEW_FIELDS);
    const previewById = new Map<number, string | undefined>();
    for (const detail of details) {
      const raw = detail.fields['System.Description'];
      if (!raw) {
        previewById.set(detail.id, undefined);
        continue;
      }
      const text = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      previewById.set(detail.id, text.length > 180 ? `${text.slice(0, 177)}…` : text);
    }

    const listed = await this.toListItems(details, activeOnly);
    return listed.map((item) => ({
      ...item,
      descriptionPreview: previewById.get(item.id),
    }));
  }

  private wiqlUrl(project?: string): string {
    const base = project
      ? `/${encodeURIComponent(project)}/_apis/wit/wiql`
      : '/_apis/wit/wiql';
    return `${base}?api-version=${AzureDevOpsClient.WIT_API_VERSION}`;
  }

  private async runWiql(wiql: string, project: string | undefined, top: number): Promise<number[]> {
    const optimized = optimizeWiql(wiql);
    const url = this.wiqlUrl(project);

    let queryResponse: { data: WiqlResponse };
    try {
      queryResponse = await this.http.post<WiqlResponse>(url, { query: optimized });
    } catch (error) {
      throw new Error(this.toFriendlyWiqlError(error));
    }

    return queryResponse.data.workItems.map((item) => item.id).slice(0, top);
  }

  private async toListItems(
    items: WorkItemBatchResponse['value'],
    activeOnly: boolean
  ): Promise<WorkItemListItem[]> {
    const typeStateCache = new Map<string, WorkItemTypeState[]>();
    const results: WorkItemListItem[] = [];

    for (const item of items) {
      const projectName = String(item.fields['System.TeamProject'] ?? '');
      const workItemType = String(item.fields['System.WorkItemType'] ?? 'Task');
      const state = String(item.fields['System.State'] ?? 'Unknown');
      const cacheKey = `${projectName}:${workItemType}`;

      if (!typeStateCache.has(cacheKey)) {
        const orgStates = await this.getWorkItemTypeStates(projectName, workItemType);
        typeStateCache.set(cacheKey, orgStates);
      }

      const orgStates = typeStateCache.get(cacheKey) ?? [];
      const stateCategory = resolveStateCategory(orgStates, state);
      if (activeOnly && (stateCategory === 'Completed' || stateCategory === 'Removed')) {
        continue;
      }

      results.push(this.mapToListItem(item, stateCategory));
    }

    return results;
  }

  async getProjects(): Promise<ProjectOption[]> {
    const response = await this.http.get<{ value: Array<{ id: string; name: string }> }>(
      `/_apis/projects?api-version=${AzureDevOpsClient.WIT_API_VERSION}&$top=100`
    );
    return response.data.value.map((project) => ({
      id: project.id,
      name: project.name,
    }));
  }

  async getCurrentSprint(project: string): Promise<AdoSprintDetails | undefined> {
    if (!project || !project.trim()) {
      return undefined;
    }

    const encProject = encodeURIComponent(project.trim());

    // 1. First attempt: Ask for the current iteration directly via $timeframe=current
    try {
      const response = await this.http.get<{
        value: Array<{
          id: string;
          name: string;
          path: string;
          attributes?: {
            startDate?: string;
            finishDate?: string;
            timeFrame?: string;
          };
        }>;
      }>(
        `/${encProject}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=${AzureDevOpsClient.WIT_API_VERSION}`
      );
      if (response.data?.value && response.data.value.length > 0) {
        const iter = response.data.value[0];
        return {
          id: iter.id,
          name: iter.name,
          path: iter.path.replace(/^\\+/, ''),
          startDate: iter.attributes?.startDate,
          finishDate: iter.attributes?.finishDate,
          timeFrame: iter.attributes?.timeFrame || 'current',
        };
      }
    } catch {
      // $timeframe query might not be supported on this organization/team configuration, fall through
    }

    // 2. Second attempt: Check teams for the project and query their current iteration
    try {
      const teamsResponse = await this.http.get<{
        value: Array<{ id: string; name: string }>;
      }>(`/_apis/projects/${encProject}/teams?api-version=${AzureDevOpsClient.WIT_API_VERSION}`);

      for (const team of teamsResponse.data.value) {
        try {
          const teamIterResponse = await this.http.get<{
            value: Array<{
              id: string;
              name: string;
              path: string;
              attributes?: {
                startDate?: string;
                finishDate?: string;
                timeFrame?: string;
              };
            }>;
          }>(
            `/${encProject}/${encodeURIComponent(team.name)}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=${AzureDevOpsClient.WIT_API_VERSION}`
          );
          if (teamIterResponse.data?.value && teamIterResponse.data.value.length > 0) {
            const iter = teamIterResponse.data.value[0];
            return {
              id: iter.id,
              name: iter.name,
              path: iter.path.replace(/^\\+/, ''),
              startDate: iter.attributes?.startDate,
              finishDate: iter.attributes?.finishDate,
              timeFrame: iter.attributes?.timeFrame || 'current',
              teamName: team.name,
            };
          }
        } catch {
          // Team iteration query failed, try next team
        }
      }
    } catch {
      // Teams check fallback
    }

    // 3. Third attempt: Query all team iterations and find the active one
    try {
      const response = await this.http.get<{
        value: Array<{
          id: string;
          name: string;
          path: string;
          attributes?: {
            startDate?: string;
            finishDate?: string;
            timeFrame?: string;
          };
        }>;
      }>(
        `/${encProject}/_apis/work/teamsettings/iterations?api-version=${AzureDevOpsClient.WIT_API_VERSION}`
      );
      const items = response.data?.value ?? [];

      // Check if any iteration has timeFrame explicitly marked as 'current'
      const markedCurrent = items.find(
        (it) => it.attributes?.timeFrame?.toLowerCase() === 'current'
      );
      if (markedCurrent) {
        return {
          id: markedCurrent.id,
          name: markedCurrent.name,
          path: markedCurrent.path.replace(/^\\+/, ''),
          startDate: markedCurrent.attributes?.startDate,
          finishDate: markedCurrent.attributes?.finishDate,
          timeFrame: markedCurrent.attributes?.timeFrame,
        };
      }

      // Check if current date falls within startDate and finishDate
      const now = new Date();
      const activeByDates = items.find((it) => {
        if (!it.attributes?.startDate || !it.attributes?.finishDate) {
          return false;
        }
        const start = new Date(it.attributes.startDate);
        const finish = new Date(it.attributes.finishDate);
        return now >= start && now <= finish;
      });
      if (activeByDates) {
        return {
          id: activeByDates.id,
          name: activeByDates.name,
          path: activeByDates.path.replace(/^\\+/, ''),
          startDate: activeByDates.attributes?.startDate,
          finishDate: activeByDates.attributes?.finishDate,
          timeFrame: 'current',
        };
      }
    } catch {
      // Team settings endpoint failed or PAT lacks Work permissions
    }

    return undefined;
  }

  async getSprintWorkItems(
    project: string,
    sprintPath: string,
    iterationId?: string,
    teamName?: string
  ): Promise<RawDashboardItem[]> {
    const encProject = encodeURIComponent(project);
    const itemIds = new Set<number>();

    // 1. Try iteration work items API if iterationId is known
    if (iterationId) {
      try {
        const teamPath = teamName ? `${encodeURIComponent(teamName)}/` : '';
        const url = `/${encProject}/${teamPath}_apis/work/teamsettings/iterations/${iterationId}/workitems?api-version=${AzureDevOpsClient.WIT_API_VERSION}`;
        const response = await this.http.get<{
          workItemRelations?: Array<{
            target?: { id: number };
            source?: { id: number };
          }>;
        }>(url);

        for (const rel of response.data.workItemRelations ?? []) {
          if (rel.target?.id) {
            itemIds.add(rel.target.id);
          }
          if (rel.source?.id) {
            itemIds.add(rel.source.id);
          }
        }
      } catch {
        // Fall back to WIQL query
      }
    }

    // 2. Query WIQL for sprint iteration path
    try {
      const cleanPath = sprintPath.replace(/^\\+/, '').replace(/'/g, "''");
      const wiql = optimizeWiql(`
        SELECT [System.Id]
        FROM WorkItems
        WHERE [System.TeamProject] = '${project.replace(/'/g, "''")}'
          AND ([System.IterationPath] = '${cleanPath}' OR [System.IterationPath] UNDER '${cleanPath}')
        ORDER BY [System.WorkItemType] ASC, [System.Id] DESC
      `);
      const ids = await this.runWiql(wiql, undefined, DASHBOARD_QUERY_TOP);
      for (const id of ids) {
        itemIds.add(id);
      }
    } catch {
      // Ignore WIQL failure
    }

    if (itemIds.size === 0) {
      return [];
    }

    const rawBatch = await this.fetchWorkItemsInBatches([...itemIds], DASHBOARD_FIELDS);
    const typeStateCache = new Map<string, WorkItemTypeState[]>();
    const dashboardItems: RawDashboardItem[] = [];

    for (const item of rawBatch) {
      const proj = String(item.fields['System.TeamProject'] ?? project);
      const workItemType = String(item.fields['System.WorkItemType'] ?? 'Task');
      const state = String(item.fields['System.State'] ?? 'Unknown');
      const cacheKey = `${proj}:${workItemType}`;

      if (!typeStateCache.has(cacheKey)) {
        const orgStates = await this.getWorkItemTypeStates(proj, workItemType);
        typeStateCache.set(cacheKey, orgStates);
      }

      const orgStates = typeStateCache.get(cacheKey) ?? [];
      dashboardItems.push({
        id: item.id,
        title: String(item.fields['System.Title'] ?? 'Untitled'),
        state,
        workItemType,
        project: proj,
        changedDate: String(item.fields['System.ChangedDate'] ?? ''),
        dueDate: item.fields['Microsoft.VSTS.Scheduling.DueDate']
          ? String(item.fields['Microsoft.VSTS.Scheduling.DueDate'])
          : item.fields['Microsoft.VSTS.Scheduling.TargetDate']
            ? String(item.fields['Microsoft.VSTS.Scheduling.TargetDate'])
            : undefined,
        stateCategory: resolveStateCategory(orgStates, state),
        iterationPath: String(item.fields['System.IterationPath'] ?? ''),
        priority:
          item.fields['Microsoft.VSTS.Common.Priority'] != null
            ? String(item.fields['Microsoft.VSTS.Common.Priority'])
            : 'N/A',
        areaPath: String(item.fields['System.AreaPath'] ?? ''),
        assignedTo: String(
          (item.fields['System.AssignedTo'] as { displayName?: string })?.displayName ?? 'Unassigned'
        ),
        tags: String(item.fields['System.Tags'] ?? '')
          .split(';')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    }

    return dashboardItems;
  }

  async getIterations(project: string): Promise<IterationOption[]> {
    const response = await this.http.get<{
      value: Array<{ id: string; name: string; path: string }>;
    }>(
      `/${encodeURIComponent(project)}/_apis/work/teamsettings/iterations?api-version=${AzureDevOpsClient.WIT_API_VERSION}`
    );
    return response.data.value.map((iteration) => ({
      id: iteration.id,
      name: iteration.name,
      path: iteration.path.replace(/^\\+/, ''),
    }));
  }

  async getIterationPaths(project: string): Promise<IterationOption[]> {
    const byPath = new Map<string, IterationOption>();

    try {
      for (const iteration of await this.getIterations(project)) {
        byPath.set(iteration.path, iteration);
      }
    } catch {
      // Fall back to classification tree when team iterations are unavailable.
    }

    try {
      const response = await this.http.get<ClassificationNode>(
        `/${encodeURIComponent(project)}/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=${AzureDevOpsClient.WIT_API_VERSION}`
      );
      for (const iteration of this.flattenIterationNodes(response.data)) {
        if (!byPath.has(iteration.path)) {
          byPath.set(iteration.path, iteration);
        }
      }
    } catch {
      // Ignore when iteration classification tree is unavailable.
    }

    return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getWorkItemTypes(project: string): Promise<string[]> {
    const response = await this.http.get<{ value: Array<{ name: string }> }>(
      `/${encodeURIComponent(project)}/_apis/wit/workitemtypes?api-version=${AzureDevOpsClient.WIT_API_VERSION}`
    );
    return response.data.value.map((type) => type.name).sort((a, b) => a.localeCompare(b));
  }

  async getAreaPaths(project: string): Promise<AreaOption[]> {
    try {
      const response = await this.http.get<ClassificationNode>(
        `/${encodeURIComponent(project)}/_apis/wit/classificationnodes/Areas?$depth=10&api-version=${AzureDevOpsClient.WIT_API_VERSION}`
      );
      return this.flattenAreaNodes(response.data);
    } catch (error) {
      throw new Error(this.toFriendlyError(error, 'load area paths'));
    }
  }

  private flattenAreaNodes(node: ClassificationNode, results: AreaOption[] = []): AreaOption[] {
    if (node.path) {
      const path = node.path.replace(/^\\+/, '');
      if (path) {
        results.push({
          path,
          name: node.name,
          label: path.split('\\').join(' › '),
        });
      }
    }

    for (const child of node.children ?? []) {
      this.flattenAreaNodes(child, results);
    }

    return results.sort((a, b) => a.label.localeCompare(b.label));
  }

  private flattenIterationNodes(
    node: ClassificationNode,
    results: IterationOption[] = []
  ): IterationOption[] {
    if (node.path) {
      const path = node.path.replace(/^\\+/, '');
      if (path) {
        results.push({
          id: String(node.id),
          name: node.name,
          path,
        });
      }
    }

    for (const child of node.children ?? []) {
      this.flattenIterationNodes(child, results);
    }

    return results;
  }

  private toFriendlyWiqlError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      if (apiMessage) {
        return apiMessage;
      }
      if (axiosError.response?.status === 400) {
        return 'Invalid search query. Check project, area, and sprint filters match your org paths.';
      }
    }
    return error instanceof Error ? error.message : 'Search query failed.';
  }

  private mapToListItem(
    item: WorkItemBatchResponse['value'][0],
    stateCategory: string
  ): WorkItemListItem {
    const fields = item.fields;
    return {
      id: item.id,
      title: String(fields['System.Title'] ?? 'Untitled'),
      state: String(fields['System.State'] ?? 'Unknown'),
      workItemType: String(fields['System.WorkItemType'] ?? 'Task'),
      project: String(fields['System.TeamProject'] ?? ''),
      iterationPath: String(fields['System.IterationPath'] ?? ''),
      changedDate: String(fields['System.ChangedDate'] ?? ''),
      dueDate: fields['Microsoft.VSTS.Scheduling.DueDate']
        ? String(fields['Microsoft.VSTS.Scheduling.DueDate'])
        : fields['Microsoft.VSTS.Scheduling.TargetDate']
          ? String(fields['Microsoft.VSTS.Scheduling.TargetDate'])
          : undefined,
      stateCategory,
    };
  }

  async getWorkItemTypeStates(project: string, workItemType: string): Promise<WorkItemTypeState[]> {
    try {
      const response = await this.http.get<WorkItemTypeStatesResponse>(
        `/${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/states?api-version=${AzureDevOpsClient.WIT_API_VERSION}`
      );
      return response.data.value;
    } catch (error) {
      throw new Error(this.toFriendlyError(error, 'load workflow states'));
    }
  }

  async updateWorkItemState(id: number, state: string): Promise<void> {
    await this.patchWorkItem(id, [
      { op: 'add', path: '/fields/System.State', value: state },
    ]);
  }

  async updateWorkItemFields(id: number, updates: {
    state?: string;
    description?: string;
    assignedToUniqueName?: string;
    completedWork?: number;
    remainingWork?: number;
    tags?: string[];
  }): Promise<void> {
    const operations: Array<{ op: string; path: string; value: string | number }> = [];

    if (updates.state !== undefined) {
      operations.push({ op: 'add', path: '/fields/System.State', value: updates.state });
    }
    if (updates.description !== undefined) {
      operations.push({
        op: 'add',
        path: '/fields/System.Description',
        value: toAdoHtml(updates.description),
      });
    }
    if (updates.assignedToUniqueName !== undefined) {
      operations.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: updates.assignedToUniqueName,
      });
    }
    if (updates.completedWork !== undefined) {
      operations.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork',
        value: updates.completedWork,
      });
    }
    if (updates.remainingWork !== undefined) {
      operations.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork',
        value: updates.remainingWork,
      });
    }
    if (updates.tags !== undefined) {
      operations.push({
        op: 'add',
        path: '/fields/System.Tags',
        value: updates.tags.join('; '),
      });
    }

    if (operations.length === 0) {
      return;
    }

    await this.patchWorkItem(id, operations);
  }

  async addWorkItemTag(id: number, tag: string): Promise<string[]> {
    const workItem = await this.fetchWorkItemFields(id);
    const normalized = tag.trim();
    if (!normalized) {
      return workItem.tags;
    }

    const exists = workItem.tags.some((t) => t.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      return workItem.tags;
    }

    const tags = [...workItem.tags, normalized];
    await this.updateWorkItemFields(id, { tags });
    return tags;
  }

  async updateWorkItemDescription(id: number, description: string): Promise<void> {
    await this.updateWorkItemFields(id, { description });
  }

  async listAttachments(workItemId: number): Promise<WorkItemAttachment[]> {
    const response = await this.http.get<SingleWorkItemResponse>(
      `/_apis/wit/workitems/${workItemId}?$expand=relations&api-version=${AzureDevOpsClient.WIT_API_VERSION}`
    );

    const relations = response.data.relations ?? [];
    return relations
      .filter((rel) => rel.rel === 'AttachedFile')
      .map((rel) => {
        const name = rel.attributes?.name ?? rel.url.split('/').pop() ?? 'attachment';
        const lower = name.toLowerCase();
        const kind: WorkItemAttachment['kind'] = IMAGE_EXT.test(lower)
          ? 'image'
          : VIDEO_EXT.test(lower)
            ? 'video'
            : 'other';
        return {
          name,
          url: rel.url,
          kind,
        };
      });
  }

  async downloadAttachment(attachmentUrl: string): Promise<Buffer> {
    const response = await this.http.get<ArrayBuffer>(attachmentUrl, {
      responseType: 'arraybuffer',
      timeout: 120_000,
      headers: {
        Accept: 'application/octet-stream',
      },
    });
    return Buffer.from(response.data);
  }

  async uploadAndAttachFile(
    project: string,
    workItemId: number,
    fileName: string,
    content: Buffer
  ): Promise<string> {
    const upload = await this.http.post<{ id: string; url: string }>(
      `/${encodeURIComponent(project)}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&api-version=${AzureDevOpsClient.WIT_API_VERSION}`,
      content,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        timeout: 120_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const attachmentUrl = upload.data.url;
    await this.http.patch(
      `/_apis/wit/workitems/${workItemId}?api-version=${AzureDevOpsClient.WIT_API_VERSION}`,
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'AttachedFile',
            url: attachmentUrl,
            attributes: { comment: `RubiOps auto: ${fileName}` },
          },
        },
      ],
      {
        headers: {
          'Content-Type': 'application/json-patch+json',
        },
      }
    );

    return attachmentUrl;
  }

  async addWorkItemComment(project: string, workItemId: number, text: string): Promise<void> {
    try {
      await this.http.post(
        `/${encodeURIComponent(project)}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`,
        { text: toAdoHtml(text) }
      );
    } catch (error) {
      throw new Error(this.toFriendlyError(error, 'add discussion comment'));
    }
  }

  async hasRubiOpsBrokenTestComment(project: string, workItemId: number): Promise<boolean> {
    const comments = await this.getWorkItemComments(project, workItemId);
    // Only the full deep report blocks a re-run (not old one-liner verifies).
    return comments.some((c) => /(?:RubiOps|DEVOPS\s*NEXA|SmartGenie)\s+Broken\s+Test/i.test(c.text));
  }

  /** @deprecated Use hasRubiOpsBrokenTestComment */
  async hasSmartGenieBrokenTestComment(project: string, workItemId: number): Promise<boolean> {
    return this.hasRubiOpsBrokenTestComment(project, workItemId);
  }

  /** True if any older short verify line exists (does not block manual retest). */
  async hasLegacyBrokenVerifyComment(project: string, workItemId: number): Promise<boolean> {
    const comments = await this.getWorkItemComments(project, workItemId);
    return comments.some((c) => /(?:RubiOps|DEVOPS\s*NEXA|SmartGenie)\s+Broken\s+Verify:/i.test(c.text));
  }

  async getProjectMembers(project: string): Promise<ProjectMember[]> {
    try {
      const teamsResponse = await this.http.get<{
        value: Array<{ id: string; name: string }>;
      }>(`/_apis/projects/${encodeURIComponent(project)}/teams?api-version=${AzureDevOpsClient.WIT_API_VERSION}`);

      const members = new Map<string, ProjectMember>();

      for (const team of teamsResponse.data.value) {
        const membersResponse = await this.http.get<{
          value: Array<{
            identity: {
              id: string;
              displayName: string;
              uniqueName?: string;
              descriptor?: string;
            };
          }>;
        }>(
          `/_apis/projects/${encodeURIComponent(project)}/teams/${team.id}/members?api-version=${AzureDevOpsClient.WIT_API_VERSION}`
        );

        for (const entry of membersResponse.data.value) {
          const identity = entry.identity;
          const uniqueName = identity.uniqueName ?? identity.descriptor ?? identity.id;
          members.set(identity.id, {
            id: identity.id,
            displayName: identity.displayName,
            uniqueName,
          });
        }
      }

      return [...members.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
      throw new Error(this.toFriendlyError(error, 'load project members'));
    }
  }

  private async patchWorkItem(
    id: number,
    operations: Array<{ op: string; path: string; value: string | number }>
  ): Promise<void> {
    try {
      await this.http.patch(
        `/_apis/wit/workitems/${id}?api-version=${AzureDevOpsClient.WIT_API_VERSION}`,
        operations,
        {
          headers: {
            'Content-Type': 'application/json-patch+json',
          },
        }
      );
    } catch (error) {
      throw new Error(this.toFriendlyError(error, 'update work item'));
    }
  }

  async getWorkItemComments(project: string, workItemId: number): Promise<WorkItemComment[]> {
    try {
      const response = await this.http.get<CommentsResponse>(
        `/${encodeURIComponent(project)}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.3&$top=100`
      );

      return response.data.comments.map((comment) => ({
        id: comment.id,
        text: stripHtml(comment.text),
        createdBy: comment.createdBy.displayName,
        createdDate: comment.createdDate,
        modifiedDate: comment.modifiedDate,
      }));
    } catch {
      return [];
    }
  }

  getWorkItemWebUrl(id: number): string {
    return `https://dev.azure.com/${this.orgName}/_workitems/edit/${id}`;
  }

  async createGitPullRequest(
    project: string,
    repository: string,
    body: Record<string, unknown>
  ): Promise<{ pullRequestId: number; url: string; title: string }> {
    try {
      const response = await this.http.post<{
        pullRequestId: number;
        title: string;
        url: string;
        _links?: { web?: { href?: string } };
      }>(
        `/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(
          repository
        )}/pullrequests?api-version=${AzureDevOpsClient.WIT_API_VERSION}`,
        body,
        { timeout: 60_000 }
      );

      const webUrl =
        response.data._links?.web?.href ||
        `https://dev.azure.com/${this.orgName}/${encodeURIComponent(project)}/_git/${encodeURIComponent(
          repository
        )}/pullrequest/${response.data.pullRequestId}`;

      return {
        pullRequestId: response.data.pullRequestId,
        url: webUrl,
        title: response.data.title,
      };
    } catch (error) {
      throw new Error(this.toFriendlyError(error, 'create pull request'));
    }
  }

  private toFriendlyError(error: unknown, action: string): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;
      if (axiosError.response?.status === 401) {
        return formatPatScopeHint(`authenticate while trying to ${action}`);
      }
      if (axiosError.response?.status === 403) {
        return formatPatScopeHint(`access Azure DevOps while trying to ${action}`);
      }
      if (axiosError.response?.status === 404) {
        return `Organization not found. Use the full URL, e.g. https://dev.azure.com/your-org`;
      }
      if (axiosError.response?.status === 400) {
        const apiMessage = axiosError.response?.data?.message;
        if (apiMessage) {
          return `Invalid state transition: ${apiMessage}`;
        }
        return `Invalid state transition. The target state may not be allowed from the current state.`;
      }
      const apiMessage = axiosError.response?.data?.message;
      if (apiMessage) {
        return `Azure DevOps error: ${apiMessage}`;
      }
      if (axiosError.code === 'ECONNABORTED') {
        return `Connection timed out while trying to ${action}.`;
      }
    }

    return error instanceof Error ? error.message : `Failed to ${action}.`;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function readAcceptanceCriteria(fields: Record<string, unknown>): string | undefined {
  const candidates = [
    fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
    fields['Custom.AcceptanceCriteria'],
    fields['AcceptanceCriteria'],
  ];

  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return undefined;
}

function toAdoHtml(text: string): string {
  if (text.includes('<')) {
    return text;
  }
  return text
    .split('\n')
    .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>');
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi)$/i;

export interface WorkItemAttachment {
  name: string;
  url: string;
  kind: 'image' | 'video' | 'other';
}
