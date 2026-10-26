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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const authService_1 = require("./auth/authService");
const tokenOptimizer_1 = require("./services/tokenOptimizer");
const agentMemory_1 = require("./services/agentMemory");
const commands_1 = require("./commands");
const extensionState_1 = require("./extensionState");
const selectionService_1 = require("./services/selectionService");
const workItemService_1 = require("./services/workItemService");
const dashboardView_1 = require("./views/dashboardView");
const agentChatPanel_1 = require("./views/agentChatPanel");
const flowGuidePanel_1 = require("./views/flowGuidePanel");
const navigationView_1 = require("./views/navigationView");
const queryPanel_1 = require("./views/queryPanel");
const tasksListPanel_1 = require("./views/tasksListPanel");
const workItemDetails_1 = require("./views/workItemDetails");
const taskBotPanel_1 = require("./views/taskBotPanel");
const tasksTreeProvider_1 = require("./providers/tasksTreeProvider");
const hubClient_1 = require("./services/hubClient");
const activityTrackerService_1 = require("./services/activityTrackerService");
const bugWatchService_1 = require("./services/bugWatchService");
const notificationService_1 = require("./services/notificationService");
const autopilotProgressPanel_1 = require("./views/autopilotProgressPanel");
const autoCodeFixService_1 = require("./services/autoCodeFixService");
const gitBranchService_1 = require("./services/gitBranchService");
const projectConnectService_1 = require("./services/projectConnectService");
const workspaceConfig_1 = require("./utils/workspaceConfig");
const constants_1 = require("./utils/constants");
const genieEntry_1 = require("./services/genieEntry");
function activate(context) {
    const output = vscode.window.createOutputChannel('RubiOps');
    context.subscriptions.push(output);
    output.appendLine('Activating RubiOps…');
    (0, extensionState_1.registerCoreCommands)(context);
    (0, tokenOptimizer_1.bindTokenStore)(context.globalState);
    (0, agentMemory_1.bindAgentMemory)(context.globalState);
    try {
        activateExtension(context, output);
        output.appendLine('RubiOps activated.');
    }
    catch (error) {
        (0, extensionState_1.logActivationError)(error);
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`Activation failed: ${message}`);
    }
}
function activateExtension(context, output) {
    const authService = new authService_1.AuthService(context.secrets);
    const hubClient = new hubClient_1.HubClient(context.secrets);
    void ensureHubEnabledGlobally(hubClient);
    const gitBranchService = new gitBranchService_1.GitBranchService();
    const activityTracker = new activityTrackerService_1.ActivityTrackerService(hubClient, gitBranchService);
    const projectConnectService = new projectConnectService_1.ProjectConnectService(output);
    const workItemService = new workItemService_1.WorkItemService(authService);
    const selectionService = new selectionService_1.SelectionService();
    const tasksTreeProvider = new tasksTreeProvider_1.TasksTreeProvider(workItemService, authService);
    const notifications = new notificationService_1.NotificationService();
    const autopilotProgress = new autopilotProgressPanel_1.AutopilotProgressPanel();
    const navigationView = new navigationView_1.NavigationViewProvider(authService, context);
    (0, extensionState_1.setNavigationRefresh)(() => {
        void navigationView.refresh();
    });
    // Register sidebar views first so restored workbench state always finds providers.
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(navigationView_1.NavigationViewProvider.viewType, navigationView, {
        webviewOptions: { retainContextWhenHidden: true },
    }), vscode.window.registerTreeDataProvider('devopsQuickUpdate.tasks', tasksTreeProvider));
    output.appendLine('Sidebar providers registered.');
    const dashboardPanel = new dashboardView_1.DashboardPanel(workItemService, authService, selectionService, context, hubClient);
    const tasksListPanel = new tasksListPanel_1.TasksListPanel(workItemService, authService, selectionService);
    const queryPanel = new queryPanel_1.QueryPanel(workItemService, authService, selectionService);
    const taskBotPanel = new taskBotPanel_1.TaskBotPanel(workItemService, authService, selectionService);
    const detailsPanel = new workItemDetails_1.WorkItemDetailsPanel(workItemService, authService, async () => {
        await dashboardPanel.refresh();
        await tasksListPanel.refresh();
        tasksTreeProvider.refresh();
    });
    const agentChatPanel = new agentChatPanel_1.AgentChatPanel(context.globalState, context.secrets, () => {
        dashboardPanel.pushTokenWatch();
    });
    (0, genieEntry_1.registerGenieEntry)(context, agentChatPanel, output);
    const panels = {
        dashboardPanel,
        agentChatPanel,
        tasksListPanel,
        queryPanel,
        taskBotPanel,
        detailsPanel,
        tasksTreeProvider,
    };
    const bugWatch = new bugWatchService_1.BugWatchService(authService, workItemService, hubClient, notifications, context, output);
    bugWatch.setProgressPanel(autopilotProgress);
    const autoCodeFix = new autoCodeFixService_1.AutoCodeFixService(context.secrets, authService, workItemService, new gitBranchService_1.GitBranchService(), notifications, output, autopilotProgress);
    bugWatch.setAutoCodeFix(autoCodeFix);
    (0, extensionState_1.setExtensionPanels)(panels);
    (0, commands_1.registerCommands)(context, authService, workItemService, selectionService, panels, hubClient, bugWatch, notifications, autoCodeFix, projectConnectService);
    const projectStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 60);
    projectStatusItem.command = 'devopsQuickUpdate.connectProjectCode';
    const updateProjectStatusBar = () => {
        const code = (0, workspaceConfig_1.getActiveProjectCode)();
        const cfg = (0, workspaceConfig_1.loadWorkspaceProjectConfig)();
        const roleBadge = cfg?.role ? ` (${cfg.roleTitle || cfg.role})` : '';
        projectStatusItem.text = `$(organization) RubiOps: [${code}]${roleBadge}`;
        projectStatusItem.tooltip = cfg?.name
            ? `${cfg.name}${roleBadge} · Click to switch Project Code`
            : `Project: ${code}${roleBadge} · Click to connect with Project Code`;
        projectStatusItem.show();
    };
    updateProjectStatusBar();
    context.subscriptions.push(projectStatusItem);
    activityTracker.start(context);
    bugWatch.start();
    output.appendLine('BugWatch started (TodayAssigned + preprod smart test).');
    context.subscriptions.push({
        dispose: () => {
            void hubClient.flush();
        },
    });
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        updateProjectStatusBar();
        workItemService.resetClient();
        await dashboardPanel.refresh();
        await tasksListPanel.refresh();
        await queryPanel.refresh();
        tasksTreeProvider.refresh();
        void navigationView.refresh();
    }), vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('devopsQuickUpdate') ||
            event.affectsConfiguration('devopsQuickUpdate.projectCode')) {
            updateProjectStatusBar();
            workItemService.resetClient();
            await dashboardPanel.refresh();
            await tasksListPanel.refresh();
            tasksTreeProvider.refresh();
            void navigationView.refresh();
        }
    }));
    const guide = new flowGuidePanel_1.FlowGuidePanel(context.globalState);
    context.subscriptions.push(vscode.commands.registerCommand(constants_1.COMMANDS.OPEN_GUIDE, async () => {
        await guide.show();
    }));
    if (!flowGuidePanel_1.FlowGuidePanel.wasSeen(context.globalState)) {
        void guide.show(true);
    }
    else {
        void promptConnectIfNeeded(authService, panels, hubClient);
    }
}
async function ensureHubEnabledGlobally(hubClient) {
    if (!hubClient.isEnabled() && (await hubClient.hasApiKey())) {
        await vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .update('hub.enabled', true, vscode.ConfigurationTarget.Global);
    }
}
async function promptConnectIfNeeded(authService, panels, hubClient) {
    const isAuthenticated = await authService.isAuthenticated();
    const workspaceLabel = authService.getWorkspaceLabel();
    if (!isAuthenticated) {
        const connect = await vscode.window.showInformationMessage(`RubiOps (${workspaceLabel}): Connect to Azure DevOps. You need an organization URL and a Personal Access Token (PAT) from Azure DevOps user settings.`, 'Connect', 'How to get PAT');
        if (connect === 'Connect') {
            await vscode.commands.executeCommand('devopsQuickUpdate.connect');
        }
        else if (connect === 'How to get PAT') {
            const { openPatHelpPage } = await Promise.resolve().then(() => __importStar(require('./utils/connectGuide')));
            await openPatHelpPage();
            await vscode.commands.executeCommand('devopsQuickUpdate.connect');
        }
        return;
    }
    await panels.dashboardPanel.show();
    if (!hubClient.isEnabled() && !(await hubClient.hasApiKey())) {
        const connectHub = await vscode.window.showInformationMessage('Connect RubiOps Hub to sync coding time and productivity to your server?', 'Connect Hub', 'Later');
        if (connectHub === 'Connect Hub') {
            await vscode.commands.executeCommand('devopsQuickUpdate.connectHub');
        }
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map