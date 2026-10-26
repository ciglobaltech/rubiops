import { WorkItemQueryFilter } from '../models/query';
import { escapeWiqlLiteral, escapeWiqlPath, resolveProjectForFilter } from '../utils/wiqlPaths';
import { optimizeWiql } from './queryOptimizer';

export class QueryService {
  buildWiql(
    filter: WorkItemQueryFilter,
    options?: { projectScoped?: boolean }
  ): string {
    const conditions: string[] = [];
    const projectScoped = options?.projectScoped ?? false;
    const project = resolveProjectForFilter(filter);

    if (filter.assignedToMe) {
      conditions.push('[System.AssignedTo] = @Me');
    }

    if (project && !projectScoped) {
      conditions.push(`[System.TeamProject] = '${escapeWiqlLiteral(project)}'`);
    }

    if (filter.iterationPath?.trim()) {
      conditions.push(`[System.IterationPath] UNDER '${escapeWiqlPath(filter.iterationPath)}'`);
    }

    if (filter.areaPath?.trim()) {
      conditions.push(`[System.AreaPath] UNDER '${escapeWiqlPath(filter.areaPath)}'`);
    }

    if (filter.dueDateFrom?.trim()) {
      conditions.push(`[Microsoft.VSTS.Scheduling.DueDate] >= '${filter.dueDateFrom.trim()}'`);
    }

    if (filter.dueDateTo?.trim()) {
      conditions.push(`[Microsoft.VSTS.Scheduling.DueDate] <= '${filter.dueDateTo.trim()}'`);
    }

    if (filter.state?.trim()) {
      conditions.push(`[System.State] = '${escapeWiqlLiteral(filter.state)}'`);
    }

    if (filter.workItemType?.trim()) {
      conditions.push(`[System.WorkItemType] = '${escapeWiqlLiteral(filter.workItemType)}'`);
    }

    if (filter.titleContains?.trim()) {
      conditions.push(`[System.Title] Contains '${escapeWiqlLiteral(filter.titleContains)}'`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join('\n          AND ')}` : '';

    return optimizeWiql(`
      SELECT [System.Id]
      FROM WorkItems
      ${whereClause}
      ORDER BY [System.ChangedDate] DESC
    `);
  }
}
