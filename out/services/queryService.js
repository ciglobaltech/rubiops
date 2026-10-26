"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryService = void 0;
const wiqlPaths_1 = require("../utils/wiqlPaths");
const queryOptimizer_1 = require("./queryOptimizer");
class QueryService {
    buildWiql(filter, options) {
        const conditions = [];
        const projectScoped = options?.projectScoped ?? false;
        const project = (0, wiqlPaths_1.resolveProjectForFilter)(filter);
        if (filter.assignedToMe) {
            conditions.push('[System.AssignedTo] = @Me');
        }
        if (project && !projectScoped) {
            conditions.push(`[System.TeamProject] = '${(0, wiqlPaths_1.escapeWiqlLiteral)(project)}'`);
        }
        if (filter.iterationPath?.trim()) {
            conditions.push(`[System.IterationPath] UNDER '${(0, wiqlPaths_1.escapeWiqlPath)(filter.iterationPath)}'`);
        }
        if (filter.areaPath?.trim()) {
            conditions.push(`[System.AreaPath] UNDER '${(0, wiqlPaths_1.escapeWiqlPath)(filter.areaPath)}'`);
        }
        if (filter.dueDateFrom?.trim()) {
            conditions.push(`[Microsoft.VSTS.Scheduling.DueDate] >= '${filter.dueDateFrom.trim()}'`);
        }
        if (filter.dueDateTo?.trim()) {
            conditions.push(`[Microsoft.VSTS.Scheduling.DueDate] <= '${filter.dueDateTo.trim()}'`);
        }
        if (filter.state?.trim()) {
            conditions.push(`[System.State] = '${(0, wiqlPaths_1.escapeWiqlLiteral)(filter.state)}'`);
        }
        if (filter.workItemType?.trim()) {
            conditions.push(`[System.WorkItemType] = '${(0, wiqlPaths_1.escapeWiqlLiteral)(filter.workItemType)}'`);
        }
        if (filter.titleContains?.trim()) {
            conditions.push(`[System.Title] Contains '${(0, wiqlPaths_1.escapeWiqlLiteral)(filter.titleContains)}'`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join('\n          AND ')}` : '';
        return (0, queryOptimizer_1.optimizeWiql)(`
      SELECT [System.Id]
      FROM WorkItems
      ${whereClause}
      ORDER BY [System.ChangedDate] DESC
    `);
    }
}
exports.QueryService = QueryService;
//# sourceMappingURL=queryService.js.map