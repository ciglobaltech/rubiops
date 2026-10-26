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
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../utils/constants");
const workItemCommandArgs_1 = require("../utils/workItemCommandArgs");
const aiAgentLauncher_1 = require("../services/aiAgentLauncher");
const extensionState_1 = require("../extensionState");
const bugWatchService_1 = require("../services/bugWatchService");
const notificationService_1 = require("../services/notificationService");
const bugWorkPlanService_1 = require("../services/bugWorkPlanService");
const descriptionBlocks_1 = require("../utils/descriptionBlocks");
const projectConnectService_1 = require("../services/projectConnectService");
const engineeringFlowClient_1 = require("../services/engineeringFlowClient");
const tokenOptimizer_1 = require("../services/tokenOptimizer");
const reviewService_1 = require("../services/reviewService");
const flutterRefactorService_1 = require("../services/flutterRefactorService");
const refactorPreviewPanel_1 = require("../views/refactorPreviewPanel");
function registerCommands(context, authService, workItemService, selectionService, panels, hubClient, bugWatch, notifications, autoCodeFix, projectConnectService) {
    const { dashboardPanel, agentChatPanel, tasksListPanel, queryPanel, taskBotPanel, detailsPanel, tasksTreeProvider } = panels;
    const flowClient = new engineeringFlowClient_1.EngineeringFlowClient();
    const refactorService = new flutterRefactorService_1.FlutterRefactorService();
    const review = new reviewService_1.ReviewService(authService, context.secrets, context.globalState, refactorService, context.extensionUri);
    context.subscriptions.push({ dispose: () => review.dispose() });
    const refactorPreviewProvider = new refactorPreviewPanel_1.RefactorPreviewPanel(context.extensionUri, refactorService);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(refactorPreviewPanel_1.RefactorPreviewPanel.viewType, refactorPreviewProvider));
    context.subscriptions.push(vscode.commands.registerCommand(constants_1.COMMANDS.CONNECT_PROJECT_CODE, async (code) => {
        const runner = projectConnectService ?? new projectConnectService_1.ProjectConnectService(vscode.window.createOutputChannel('RubiOps'));
        const ok = await runner.promptAndConnect(code);
        if (ok) {
            workItemService.resetClient();
            await dashboardPanel.refresh();
            await tasksListPanel.refresh();
            tasksTreeProvider.refresh();
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.WHY_DELAYED, async (itemId) => {
        await flowClient.diagnoseWhyDelayed(itemId);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.TODAY_QUEUE, async () => {
        await flowClient.showTodayQueue();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.GENERATE_TESTS, async () => {
        await flowClient.generateTestCasesFromRequirement();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.DEVELOPER_CHECKLIST, async () => {
        await flowClient.generateDeveloperChecklist();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.RUN_TEST_COMMANDER, async (requirement) => {
        await flowClient.runTestCommander(requirement);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.CONNECT, async () => {
        const connected = await authService.promptForCredentials();
        if (!connected) {
            return;
        }
        try {
            workItemService.resetClient();
            await workItemService.testConnection();
            vscode.window.showInformationMessage(`Connected to Azure DevOps for "${authService.getWorkspaceLabel()}".`);
            await dashboardPanel.show();
            await (0, extensionState_1.runRefreshAll)();
            hubClient.track({
                platform: 'ado',
                category: 'activity',
                action: 'ado.activity.connected',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            await authService.clearPat();
            workItemService.resetClient();
            const message = error instanceof Error ? error.message : 'Connection failed';
            vscode.window.showErrorMessage(`Failed to connect: ${message}`);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_DASHBOARD, async () => {
        await dashboardPanel.show();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_AGENT, async () => {
        await agentChatPanel.show();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.CODE_REVIEW, async () => {
        await review.startCodeReview();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.MERGE_REVIEW, async () => {
        await review.startMergeReview();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_LAST_REPORT, async () => {
        await review.openLastReport();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_REFACTOR_PREVIEW, async () => {
        await refactorService.scanWorkspace();
        await refactorPreviewPanel_1.RefactorPreviewPanel.show(context.extensionUri, refactorService);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.SHOW_TOKEN_BUDGET, async () => {
        const budget = (0, tokenOptimizer_1.readTokenBudget)();
        const status = budget.exhausted
            ? 'Daily budget is used up and resets tomorrow.'
            : budget.nearLimit
                ? 'Near the daily limit, so new prompts are compressed and large requests are downgraded.'
                : 'Queries are capped and long prompts are trimmed before they are sent.';
        vscode.window.showInformationMessage(`Token budget — used ${budget.usedToday.toLocaleString()} · remaining ${budget.remaining.toLocaleString()} of ${budget.dailyBudget.toLocaleString()} · est. cost $${budget.costToday.toFixed(4)} · ${budget.requestsToday} requests. ${status}`);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_TASKS, async () => {
        await tasksListPanel.show();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.FOCUS_TASKS_TREE, async () => {
        await vscode.commands.executeCommand('devopsQuickUpdate.tasks.focus');
        tasksTreeProvider.refresh();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_QUERY, async () => {
        await queryPanel.show();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_TASK_BOT, async () => {
        await taskBotPanel.show();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.START_WORK, async () => {
        await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.COMPLETE, async () => {
        await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.BLOCKED, async () => {
        await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.CHANGE_STATE, async (item) => {
        const ref = (0, workItemCommandArgs_1.resolveWorkItemCommandRef)(item);
        if (ref) {
            selectionService.select(ref.id, ref.title ?? `#${ref.id}`);
        }
        await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_WORK_ITEM, async (item, title) => {
        const ref = (0, workItemCommandArgs_1.resolveWorkItemCommandRef)(item, title);
        if (!ref) {
            const selected = selectionService.getSelected();
            if (!selected) {
                vscode.window.showWarningMessage('Select a task first, then open details.');
                return;
            }
            await detailsPanel.show(selected.id);
            return;
        }
        selectionService.select(ref.id, ref.title ?? `#${ref.id}`);
        await detailsPanel.show(ref.id);
    }), vscode.commands.registerCommand(constants_1.COMMANDS.COPY_STANDUP, async () => {
        try {
            const summary = await workItemService.getStandupSummary();
            await vscode.env.clipboard.writeText(summary);
            hubClient.track({
                platform: 'vscode',
                category: 'output',
                action: 'vscode.output.standup_copied',
                timestamp: new Date().toISOString(),
            });
            vscode.window.showInformationMessage('Standup summary copied to clipboard.');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to generate standup';
            vscode.window.showErrorMessage(message);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.COPY_COMMIT_MESSAGE, async (workItemId) => {
        try {
            let id = typeof workItemId === 'number' ? workItemId : undefined;
            if (!id) {
                const selected = selectionService.getSelected();
                id = selected?.id;
            }
            if (!id) {
                const insights = await workItemService.getSmartInsights();
                id =
                    insights.recommended?.workItem.id ?? insights.gitContext.linkedWorkItemId;
            }
            if (!id) {
                vscode.window.showWarningMessage('Select a task, use a branch with a work item ID, or open the dashboard for AI suggestions.');
                return;
            }
            const message = await workItemService.getCommitMessageForWorkItem(id);
            await vscode.env.clipboard.writeText(message);
            vscode.window.showInformationMessage(`Copied commit message: ${message}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to copy commit message';
            vscode.window.showErrorMessage(message);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.COPY_AI_PROMPT, async (workItemId) => {
        try {
            const id = await resolveWorkItemIdForAi(workItemId, selectionService, workItemService);
            if (!id) {
                return;
            }
            const prompt = await workItemService.getTaskImplementationPrompt(id);
            await (0, aiAgentLauncher_1.copyAiPrompt)(prompt);
            hubClient.track({
                platform: 'vscode',
                category: 'output',
                action: 'vscode.output.ai_prompt_copied',
                timestamp: new Date().toISOString(),
                workItemId: id,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to copy AI prompt';
            vscode.window.showErrorMessage(message);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_AI_AGENT, async (workItemId) => {
        try {
            const id = await resolveWorkItemIdForAi(workItemId, selectionService, workItemService);
            if (!id) {
                return;
            }
            const prompt = await workItemService.getTaskImplementationPrompt(id);
            await (0, aiAgentLauncher_1.copyOrOpenAiPrompt)(prompt);
            hubClient.track({
                platform: 'vscode',
                category: 'output',
                action: 'vscode.output.ai_agent_opened',
                timestamp: new Date().toISOString(),
                workItemId: id,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to open AI agent';
            vscode.window.showErrorMessage(message);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_RECOMMENDED, async () => {
        try {
            const insights = await workItemService.getSmartInsights();
            if (!insights.recommended) {
                vscode.window.showInformationMessage('No task recommendation available right now.');
                return;
            }
            await detailsPanel.show(insights.recommended.workItem.id);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to open recommended task';
            vscode.window.showErrorMessage(message);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_BRANCH_WORK_ITEM, async () => {
        try {
            const insights = await workItemService.getSmartInsights();
            const id = insights.gitContext.linkedWorkItemId;
            if (!id) {
                vscode.window.showWarningMessage('Current git branch does not contain a detectable work item ID.');
                return;
            }
            await detailsPanel.show(id);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to open branch work item';
            vscode.window.showErrorMessage(message);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.CONNECT_HUB, async () => {
        const ok = await hubClient.configureApiKey();
        if (ok) {
            await dashboardPanel.refresh();
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.DISCONNECT_HUB, async () => {
        await hubClient.disconnect();
        vscode.window.showInformationMessage('RubiOps Hub disconnected.');
        await dashboardPanel.refresh();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.RUN_BUG_WATCH, async () => {
        if (!bugWatch) {
            vscode.window.showWarningMessage('Bug Watch is not available.');
            return;
        }
        // Full-screen Autopilot progress panel — no tiny corner notification.
        await bugWatch.pollNow(true);
        await dashboardPanel.refresh();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.VERIFY_BROKEN_ISSUE, async (id) => {
        const notify = notifications ?? new notificationService_1.NotificationService();
        const selectedId = typeof id === 'number' ? id : selectionService.getSelected()?.id;
        if (!selectedId) {
            if (bugWatch) {
                await bugWatch.pollNow(true);
                await dashboardPanel.refresh();
                return;
            }
            vscode.window.showWarningMessage('No work item selected and Bug Watch unavailable.');
            return;
        }
        try {
            await (0, bugWatchService_1.runBrokenVerifyCommand)(workItemService, notify, hubClient, selectedId);
            await dashboardPanel.refresh();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Verify failed: ${message}`);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.BUILD_BUG_WORK_PLAN, async (id) => {
        const selectedId = typeof id === 'number' ? id : selectionService.getSelected()?.id;
        if (!selectedId) {
            if (bugWatch) {
                await bugWatch.pollNow(true);
                await dashboardPanel.refresh();
                return;
            }
            vscode.window.showWarningMessage('No work item selected and Bug Watch unavailable.');
            return;
        }
        try {
            const client = await workItemService.ensureClient();
            const workItem = await client.getWorkItem(selectedId);
            const plan = new bugWorkPlanService_1.BugWorkPlanService().buildPlan(workItem);
            const next = (0, descriptionBlocks_1.upsertDescriptionBlock)(workItem.description, 'Work Plan', plan.plainText);
            await client.updateWorkItemDescription(workItem.id, next);
            const notify = notifications ?? new notificationService_1.NotificationService();
            notify.toast(`Work plan written to #${workItem.id} Description (no comment).`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Build work plan failed: ${message}`);
        }
    }), vscode.commands.registerCommand(constants_1.COMMANDS.SET_CURSOR_API_KEY, async () => {
        if (!autoCodeFix) {
            vscode.window.showWarningMessage('Auto Code Fix is not available.');
            return;
        }
        await autoCodeFix.promptAndStoreCursorApiKey();
    }), vscode.commands.registerCommand(constants_1.COMMANDS.AUTO_CODE_FIX, async (id) => {
        if (!autoCodeFix) {
            vscode.window.showWarningMessage('Auto Code Fix is not available.');
            return;
        }
        const selectedId = typeof id === 'number' ? id : selectionService.getSelected()?.id;
        if (!selectedId) {
            vscode.window.showWarningMessage('Select a work item first (open Details), or pass a work item id.');
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`Run unattended Auto Code Fix on #${selectedId}?\n\n` +
            `Workspace must be the target git repo. This will create a branch, run Cursor SDK, commit, push, and open an Azure DevOps PR.`, { modal: true }, 'Run Auto Code Fix');
        if (confirm !== 'Run Auto Code Fix') {
            return;
        }
        const result = await autoCodeFix.run(selectedId);
        if (result.ok) {
            await dashboardPanel.refresh();
        }
    }));
}
async function changeWorkItemState(workItemService, selectionService, panels, hubClient) {
    const selected = selectionService.getSelected();
    if (!selected) {
        const openTasks = await vscode.window.showWarningMessage('No task selected. Open My Tasks and select a task first.', 'Open My Tasks');
        if (openTasks === 'Open My Tasks') {
            await panels.tasksListPanel.show();
        }
        return;
    }
    try {
        const context = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Loading valid transitions for #${selected.id}...`,
        }, async () => workItemService.getValidTransitionContext(selected.id));
        const targetState = await pickValidState(context);
        if (!targetState) {
            return;
        }
        const saveResult = await workItemService.saveWorkItemChanges(selected.id, { state: targetState });
        if (saveResult.stateChanged && saveResult.newState) {
            await workItemService.promptBranchAfterStateChange(saveResult.workItem, saveResult.newState);
            hubClient.track({
                platform: 'vscode',
                category: 'output',
                action: 'vscode.output.workitem_state_changed',
                timestamp: new Date().toISOString(),
                workItemId: selected.id,
                metadata: { newState: saveResult.newState },
            });
        }
        vscode.window.showInformationMessage(`Work item #${selected.id} updated to "${targetState}".`);
        await panels.dashboardPanel.refresh();
        await panels.tasksListPanel.refresh();
        await panels.queryPanel.refresh();
        panels.tasksTreeProvider.refresh();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Update failed';
        vscode.window.showErrorMessage(`Failed to update work item: ${message}`);
    }
}
async function pickValidState(context) {
    const parentInfo = context.parentTitle
        ? `Parent: ${context.parentType ?? 'Item'} #${context.parentId} (${context.parentState})`
        : 'No parent';
    const selection = await vscode.window.showQuickPick(context.validStates.map((state) => ({
        label: state.name,
        description: `${context.workItemType} · ${state.category}`,
        detail: parentInfo,
        stateName: state.name,
    })), {
        title: 'Change State (from org workflow)',
        placeHolder: `${context.workItemType} #${context.workItemId}: ${context.currentState} → select valid transition`,
        ignoreFocusOut: true,
    });
    return selection?.stateName;
}
async function resolveWorkItemIdForAi(workItemId, selectionService, workItemService) {
    if (typeof workItemId === 'number') {
        return workItemId;
    }
    const selected = selectionService.getSelected();
    if (selected?.id) {
        return selected.id;
    }
    const insights = await workItemService.getSmartInsights();
    const id = insights.recommended?.workItem.id ?? insights.gitContext.linkedWorkItemId;
    if (!id) {
        vscode.window.showWarningMessage('Open a work item or select a task first.');
        return undefined;
    }
    return id;
}
//# sourceMappingURL=index.js.map