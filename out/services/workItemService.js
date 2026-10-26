"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkItemService = void 0;
const vscode = __importStar(require("vscode"));
const azureDevOpsClient_1 = require("../azure/azureDevOpsClient");
const dashboardService_1 = require("./dashboardService");
const queryService_1 = require("./queryService");
const stateResolver_1 = require("./stateResolver");
const gitBranchService_1 = require("./gitBranchService");
const smartAssistantService_1 = require("./smartAssistantService");
const timeLogService_1 = require("./timeLogService");
const taskBotService_1 = require("./taskBotService");
const aiPromptService_1 = require("./aiPromptService");
const gitWorkItem_1 = require("../utils/gitWorkItem");
const patScopes_1 = require("../utils/patScopes");
const timeLogSettings_1 = require("../utils/timeLogSettings");
const wiqlPaths_1 = require("../utils/wiqlPaths");
const activityComments_1 = require("../utils/activityComments");
class WorkItemService {
    authService;
    client;
    stateResolver = new stateResolver_1.StateResolver();
    dashboardService = new dashboardService_1.DashboardService();
    queryService = new queryService_1.QueryService();
    gitBranchService = new gitBranchService_1.GitBranchService();
    smartAssistant = new smartAssistantService_1.SmartAssistantService();
    timeLogService = new timeLogService_1.TimeLogService();
    taskBotService = new taskBotService_1.TaskBotService();
    constructor(authService) {
        this.authService = authService;
    }
    async ensureClient() {
        if (this.client) {
            return this.client;
        }
        const pat = await this.authService.getPat();
        const orgUrl = this.authService.getOrganizationUrl();
        if (!pat || !orgUrl) {
            throw new Error('Not connected to Azure DevOps. Run "Connect Azure DevOps" first.');
        }
        this.client = new azureDevOpsClient_1.AzureDevOpsClient(orgUrl, pat);
        return this.client;
    }
    resetClient() {
        this.client = undefined;
        this.stateResolver.clearCache();
    }
    async getAssignedWorkItems() {
        const client = await this.ensureClient();
        return client.getAssignedWorkItems();
    }
    async getWorkItem(id) {
        const client = await this.ensureClient();
        const [workItem, currentUser] = await Promise.all([
            client.getWorkItem(id),
            client.getCurrentUser(),
        ]);
        const orgStates = await this.loadOrgStates(client, workItem.project, workItem.workItemType);
        workItem.stateCategory = (0, dashboardService_1.resolveStateCategory)(orgStates, workItem.state);
        workItem.isAssignedToMe = this.isAssignedToCurrentUser(workItem.assignedTo, currentUser);
        return workItem;
    }
    async getWorkItemComments(id) {
        const client = await this.ensureClient();
        const workItem = await client.getWorkItem(id);
        return client.getWorkItemComments(workItem.project, id);
    }
    async getTaskListItems(activeOnly = true) {
        const client = await this.ensureClient();
        const wiql = `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.AssignedTo] = @Me
      ORDER BY [System.ChangedDate] DESC
    `;
        return client.searchWorkItems(wiql, activeOnly);
    }
    async searchWorkItems(filter) {
        const client = await this.ensureClient();
        const project = (0, wiqlPaths_1.resolveProjectForFilter)(filter);
        const normalizedFilter = {
            ...filter,
            project,
        };
        const wiql = this.queryService.buildWiql(normalizedFilter, {
            projectScoped: Boolean(project),
        });
        const items = await client.searchWorkItems(wiql, filter.activeOnly, project);
        return { items, wiql };
    }
    async searchWithTaskBot(query) {
        const client = await this.ensureClient();
        const project = this.authService.getProjectName()?.trim() ||
            (await client.getProjects())[0]?.name ||
            '';
        const filterOptions = await this.getSearchFilterOptions(project);
        const parsed = this.taskBotService.parseQuery(query, filterOptions.states);
        if (parsed.workItemId) {
            try {
                const workItem = await client.getWorkItem(parsed.workItemId);
                const item = {
                    id: workItem.id,
                    title: workItem.title,
                    state: workItem.state,
                    workItemType: workItem.workItemType,
                    project: workItem.project,
                    iterationPath: workItem.iterationPath ?? '',
                    changedDate: workItem.changedDate ?? new Date().toISOString(),
                    dueDate: workItem.dueDate,
                    stateCategory: 'Unknown',
                    descriptionPreview: workItem.description
                        ? workItem.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
                        : undefined,
                };
                const ranked = this.taskBotService.rankResults([item], parsed, query);
                return this.taskBotService.buildSearchResponse(query, parsed, ranked, `workitem/${parsed.workItemId}`);
            }
            catch {
                // Fall through to keyword search.
            }
        }
        if (parsed.keywords.length === 0 &&
            parsed.scope !== 'mine' &&
            parsed.stateNames.length === 0 &&
            !parsed.assignedToMe) {
            return this.taskBotService.buildSearchResponse(query, parsed, [], '');
        }
        const wiql = this.taskBotService.buildWiql(parsed, project || undefined);
        const activeOnly = parsed.scope === 'active';
        const items = await client.searchWorkItemsWithPreview(wiql, activeOnly, project || undefined);
        const ranked = this.taskBotService.rankResults(items, parsed, query);
        return this.taskBotService.buildSearchResponse(query, parsed, ranked, wiql);
    }
    async getProjects() {
        const client = await this.ensureClient();
        return client.getProjects();
    }
    async getIterations(project) {
        const client = await this.ensureClient();
        return client.getIterations(project);
    }
    async getSearchFilterOptions(projectName) {
        const client = await this.ensureClient();
        const projects = await client.getProjects();
        const project = projectName?.trim() ||
            this.authService.getProjectName()?.trim() ||
            projects[0]?.name ||
            '';
        if (!project) {
            return {
                projects,
                areas: [],
                iterations: [],
                states: [],
                workItemTypes: [],
                defaultProject: '',
            };
        }
        const workItemTypes = await client.getWorkItemTypes(project);
        const [iterations, areas] = await Promise.all([
            client.getIterationPaths(project),
            client.getAreaPaths(project),
        ]);
        const stateMap = new Map();
        await Promise.all(workItemTypes.map(async (type) => {
            const states = await client.getWorkItemTypeStates(project, type);
            for (const state of states) {
                if (!stateMap.has(state.name)) {
                    stateMap.set(state.name, { name: state.name, category: state.category });
                }
            }
        }));
        const states = Array.from(stateMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        return {
            projects,
            areas,
            iterations,
            states,
            workItemTypes,
            defaultProject: project,
        };
    }
    async getDashboardData() {
        const client = await this.ensureClient();
        const configProject = this.authService.getProjectName()?.trim();
        const currentUser = await client.getCurrentUser();
        // 1. Determine active project
        let project = configProject || '';
        if (!project) {
            const projects = await client.getProjects().catch(() => []);
            project = projects[0]?.name || '';
        }
        // 2. Query current active sprint for the project
        let adoSprint;
        if (project) {
            try {
                adoSprint = await client.getCurrentSprint(project);
            }
            catch {
                adoSprint = undefined;
            }
        }
        // 3. If active sprint is available, get work items from CURRENT SPRINT!
        let items = [];
        if (adoSprint && project) {
            try {
                items = await client.getSprintWorkItems(project, adoSprint.path, adoSprint.id, adoSprint.teamName);
            }
            catch {
                items = [];
            }
        }
        // 4. Fallback to assigned items if no sprint work items were retrieved
        if (items.length === 0) {
            items = await client.getDashboardItems();
        }
        return this.dashboardService.buildDashboard(items, currentUser, adoSprint);
    }
    async getSmartInsights() {
        const dashboard = await this.getDashboardData();
        return this.buildSmartInsights(dashboard);
    }
    async buildSmartInsights(dashboard) {
        const gitContext = await this.gitBranchService.getBranchContext();
        return this.smartAssistant.buildInsights(dashboard, gitContext);
    }
    async getCommitMessageForWorkItem(id) {
        const workItem = await this.getWorkItem(id);
        return (0, gitWorkItem_1.formatCommitMessage)(workItem.id, workItem.title);
    }
    async getTaskImplementationPrompt(id) {
        const workItem = await this.getWorkItem(id);
        const webUrl = await this.getWorkItemWebUrl(id);
        return (0, aiPromptService_1.buildTaskImplementationPrompt)({
            workItem,
            workspaceLabel: this.authService.getWorkspaceLabel(),
            projectName: this.authService.getProjectName() ?? workItem.project,
            orgUrl: this.authService.getOrganizationUrl() ?? undefined,
            webUrl,
        });
    }
    async getStandupSummary() {
        const insights = await this.getSmartInsights();
        return insights.standupSummary;
    }
    async getValidStatesForWorkItem(id) {
        const client = await this.ensureClient();
        const workItem = await client.getWorkItem(id);
        if (!workItem.project) {
            return [];
        }
        const orgStates = await this.loadOrgStates(client, workItem.project, workItem.workItemType);
        return client.getValidTransitions(id, orgStates);
    }
    async getValidTransitionContext(id) {
        const client = await this.ensureClient();
        const workItem = await client.getWorkItem(id);
        if (!workItem.project) {
            throw new Error('Work item project could not be determined.');
        }
        const orgStates = await this.loadOrgStates(client, workItem.project, workItem.workItemType);
        const validStates = await client.getValidTransitions(id, orgStates);
        if (validStates.length === 0) {
            const available = orgStates.map((state) => state.name).join(', ');
            throw new Error(`No valid transitions from "${workItem.state}" for ${workItem.workItemType}. ` +
                `Configured states: ${available}`);
        }
        return {
            workItemId: workItem.id,
            workItemType: workItem.workItemType,
            project: workItem.project,
            currentState: workItem.state,
            parentId: workItem.parentId,
            parentTitle: workItem.parentTitle,
            parentState: workItem.parentState,
            parentType: workItem.parentType,
            validStates,
        };
    }
    async getWorkItemEditContext(id) {
        const client = await this.ensureClient();
        const [workItem, currentUser, comments] = await Promise.all([
            client.getWorkItem(id),
            client.getCurrentUser(),
            this.getWorkItemComments(id),
        ]);
        const orgStates = await this.loadOrgStates(client, workItem.project, workItem.workItemType);
        workItem.stateCategory = (0, dashboardService_1.resolveStateCategory)(orgStates, workItem.state);
        workItem.isAssignedToMe = this.isAssignedToCurrentUser(workItem.assignedTo, currentUser);
        const [validStates, members] = await Promise.all([
            client.getValidTransitions(id, orgStates),
            client.getProjectMembers(workItem.project),
        ]);
        return {
            workItem,
            validStates,
            allOrgStates: orgStates,
            members,
            comments,
            currentUser,
        };
    }
    async updateWorkItem(id, update) {
        const saveResult = await this.saveWorkItemChanges(id, update);
        if (saveResult.stateChanged && saveResult.newState) {
            return this.handleBranchAfterStateChange(saveResult.workItem, saveResult.newState);
        }
        return undefined;
    }
    async saveWorkItemChanges(id, update) {
        const client = await this.ensureClient();
        const [workItem, currentUser] = await Promise.all([
            client.getWorkItem(id),
            client.getCurrentUser(),
        ]);
        const stateWillChange = update.state !== undefined && update.state !== workItem.state;
        let timeLog;
        if (stateWillChange && update.completedWork === undefined && update.hoursSpent === undefined) {
            const orgStates = await this.loadOrgStates(client, workItem.project, workItem.workItemType);
            const newCategory = (0, dashboardService_1.resolveStateCategory)(orgStates, update.state);
            if (this.timeLogService.shouldPrompt(update.state, newCategory)) {
                timeLog = await this.timeLogService.promptForHours(workItem, update.state, newCategory);
                if (!timeLog && (0, timeLogSettings_1.isTimeLogRequired)()) {
                    throw new Error('Status change cancelled — time log is required.');
                }
            }
        }
        const fieldUpdates = {};
        const changeLog = {
            workItemId: id,
            changedBy: currentUser,
        };
        if (update.state !== undefined) {
            fieldUpdates.state = update.state;
            if (update.state !== workItem.state) {
                changeLog.stateChange = { from: workItem.state, to: update.state };
            }
        }
        if (update.description !== undefined) {
            fieldUpdates.description = update.description;
            changeLog.descriptionUpdated = true;
        }
        if (update.assignedToUniqueName !== undefined) {
            let newAssigneeLabel = 'Unassigned';
            if (update.assignedToUniqueName === null || update.assignedToUniqueName === '') {
                fieldUpdates.assignedToUniqueName = '';
            }
            else {
                const members = await client.getProjectMembers(workItem.project);
                const member = members.find((m) => m.uniqueName === update.assignedToUniqueName);
                fieldUpdates.assignedToUniqueName = member
                    ? `${member.displayName} <${member.uniqueName}>`
                    : update.assignedToUniqueName;
                newAssigneeLabel = member?.displayName ?? update.assignedToUniqueName;
            }
            const previousAssignee = workItem.assignedTo || 'Unassigned';
            if (previousAssignee !== newAssigneeLabel) {
                changeLog.assigneeChange = { from: previousAssignee, to: newAssigneeLabel };
            }
        }
        if (timeLog) {
            fieldUpdates.completedWork = timeLog.newCompletedWork;
            if (timeLog.remainingWork !== undefined) {
                fieldUpdates.remainingWork = timeLog.remainingWork;
            }
            changeLog.hoursLogged = {
                spent: timeLog.hoursSpent,
                totalCompletedWork: timeLog.newCompletedWork,
            };
        }
        else if (update.completedWork !== undefined) {
            fieldUpdates.completedWork = update.completedWork;
            if (update.remainingWork !== undefined) {
                fieldUpdates.remainingWork = update.remainingWork;
            }
            if (update.hoursSpent !== undefined && update.hoursSpent > 0) {
                changeLog.hoursLogged = {
                    spent: update.hoursSpent,
                    totalCompletedWork: update.completedWork,
                };
            }
        }
        if (Object.keys(fieldUpdates).length > 0) {
            await this.applyWorkItemFieldUpdates(client, id, fieldUpdates, changeLog);
        }
        if ((0, activityComments_1.hasTrackedChanges)(changeLog)) {
            await client.addWorkItemComment(workItem.project, id, (0, activityComments_1.formatWorkItemUpdateComment)(changeLog));
        }
        if (update.comment?.trim()) {
            await client.addWorkItemComment(workItem.project, id, update.comment.trim());
        }
        const stateChanged = update.state !== undefined && update.state !== workItem.state;
        return {
            workItem,
            stateChanged,
            newState: stateChanged ? update.state : undefined,
        };
    }
    async promptBranchAfterStateChange(workItem, newState) {
        return this.handleBranchAfterStateChange(workItem, newState);
    }
    async updateToState(id, state) {
        const saveResult = await this.saveWorkItemChanges(id, { state });
        if (saveResult.stateChanged && saveResult.newState) {
            return this.promptBranchAfterStateChange(saveResult.workItem, saveResult.newState);
        }
        return undefined;
    }
    async handleBranchAfterStateChange(workItem, newState) {
        const client = await this.ensureClient();
        const [orgStates, currentUser] = await Promise.all([
            this.loadOrgStates(client, workItem.project, workItem.workItemType),
            client.getCurrentUser(),
        ]);
        const category = (0, dashboardService_1.resolveStateCategory)(orgStates, newState);
        const result = await this.gitBranchService.maybeCreateBranchForActiveState({
            workItemId: workItem.id,
            title: workItem.title,
            stateName: newState,
            createdBy: currentUser,
        }, category);
        if (result.created && result.baseBranch && result.branchName && result.createdBy) {
            const comment = (0, activityComments_1.formatBranchCreatedComment)(workItem.id, result.baseBranch, result.branchName, result.createdBy);
            await client.addWorkItemComment(workItem.project, workItem.id, comment);
            vscode.window.showInformationMessage(`${result.message} Discussion comment added to work item #${workItem.id}.`);
        }
        else if (result.created) {
            vscode.window.showInformationMessage(result.message);
        }
        else if (result.branchName && result.message.includes('Switched')) {
            vscode.window.showInformationMessage(result.message);
        }
        else if (!result.skipped && result.message) {
            vscode.window.showWarningMessage(result.message);
        }
        return result;
    }
    async getWorkItemWebUrl(id) {
        const client = await this.ensureClient();
        return client.getWorkItemWebUrl(id);
    }
    async openInBrowser(id) {
        const client = await this.ensureClient();
        const url = client.getWorkItemWebUrl(id);
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
    async testConnection() {
        const client = await this.ensureClient();
        await client.getCurrentUser();
        return true;
    }
    async loadOrgStates(client, project, workItemType) {
        let states = this.stateResolver.getCachedStates(project, workItemType);
        if (!states) {
            states = await client.getWorkItemTypeStates(project, workItemType);
            this.stateResolver.setCachedStates(project, workItemType, states);
        }
        return states;
    }
    isAssignedToCurrentUser(assignedTo, currentUser) {
        const normalize = (value) => value.trim().toLowerCase();
        const assigned = normalize(assignedTo);
        const user = normalize(currentUser);
        return assigned === user || assigned.includes(user) || user.includes(assigned);
    }
    async applyWorkItemFieldUpdates(client, id, fieldUpdates, changeLog) {
        try {
            await client.updateWorkItemFields(id, fieldUpdates);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const hasSchedulingFields = fieldUpdates.completedWork !== undefined || fieldUpdates.remainingWork !== undefined;
            if (!hasSchedulingFields || !(0, patScopes_1.isSchedulingFieldError)(message)) {
                throw error;
            }
            const { completedWork: _completedWork, remainingWork: _remainingWork, ...rest } = fieldUpdates;
            delete changeLog.hoursLogged;
            if (Object.keys(rest).length === 0) {
                throw new Error(`Could not log hours on work item #${id} — this type may not support Completed Work / Remaining Work.`);
            }
            vscode.window.showWarningMessage(`Hours could not be saved on #${id} (Completed Work not supported for this work item type). Other changes were applied.`);
            await client.updateWorkItemFields(id, rest);
        }
    }
}
exports.WorkItemService = WorkItemService;
//# sourceMappingURL=workItemService.js.map