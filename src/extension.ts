import * as vscode from 'vscode';
import { AuthService } from './auth/authService';
import { bindTokenStore } from './services/tokenOptimizer';
import { bindAgentMemory } from './services/agentMemory';
import { registerCommands } from './commands';
import { PanelBundle } from './panelBundle';
import {
  logActivationError,
  registerCoreCommands,
  setExtensionPanels,
  setNavigationRefresh,
} from './extensionState';
import { SelectionService } from './services/selectionService';
import { WorkItemService } from './services/workItemService';
import { DashboardPanel } from './views/dashboardView';
import { AgentChatPanel } from './views/agentChatPanel';
import { FlowGuidePanel } from './views/flowGuidePanel';
import { NavigationViewProvider } from './views/navigationView';
import { QueryPanel } from './views/queryPanel';
import { TasksListPanel } from './views/tasksListPanel';
import { WorkItemDetailsPanel } from './views/workItemDetails';
import { TaskBotPanel } from './views/taskBotPanel';
import { TasksTreeProvider } from './providers/tasksTreeProvider';
import { HubClient } from './services/hubClient';
import { ActivityTrackerService } from './services/activityTrackerService';
import { BugWatchService } from './services/bugWatchService';
import { NotificationService } from './services/notificationService';
import { AutopilotProgressPanel } from './views/autopilotProgressPanel';
import { AutoCodeFixService } from './services/autoCodeFixService';
import { GitBranchService } from './services/gitBranchService';
import { ProjectConnectService } from './services/projectConnectService';
import { getActiveProjectCode, loadWorkspaceProjectConfig } from './utils/workspaceConfig';
import { COMMANDS } from './utils/constants';
import { registerGenieEntry } from './services/genieEntry';

export type { PanelBundle } from './panelBundle';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('RubiOps');
  context.subscriptions.push(output);
  output.appendLine('Activating RubiOps…');

  registerCoreCommands(context);
  bindTokenStore(context.globalState);
  bindAgentMemory(context.globalState);

  try {
    activateExtension(context, output);
    output.appendLine('RubiOps activated.');
  } catch (error) {
    logActivationError(error);
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Activation failed: ${message}`);
  }
}

function activateExtension(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
): void {
  const authService = new AuthService(context.secrets);
  const hubClient = new HubClient(context.secrets);
  void ensureHubEnabledGlobally(hubClient);
  const gitBranchService = new GitBranchService();
  const activityTracker = new ActivityTrackerService(hubClient, gitBranchService);
  const projectConnectService = new ProjectConnectService(output);
  const workItemService = new WorkItemService(authService);
  const selectionService = new SelectionService();
  const tasksTreeProvider = new TasksTreeProvider(workItemService, authService);
  const notifications = new NotificationService();
  const autopilotProgress = new AutopilotProgressPanel();

  const navigationView = new NavigationViewProvider(authService, context);
  setNavigationRefresh(() => {
    void navigationView.refresh();
  });

  // Register sidebar views first so restored workbench state always finds providers.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NavigationViewProvider.viewType, navigationView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerTreeDataProvider('devopsQuickUpdate.tasks', tasksTreeProvider)
  );
  output.appendLine('Sidebar providers registered.');

  const dashboardPanel = new DashboardPanel(
    workItemService,
    authService,
    selectionService,
    context,
    hubClient
  );
  const tasksListPanel = new TasksListPanel(workItemService, authService, selectionService);
  const queryPanel = new QueryPanel(workItemService, authService, selectionService);
  const taskBotPanel = new TaskBotPanel(workItemService, authService, selectionService);
  const detailsPanel = new WorkItemDetailsPanel(workItemService, authService, async () => {
    await dashboardPanel.refresh();
    await tasksListPanel.refresh();
    tasksTreeProvider.refresh();
  });

  const agentChatPanel = new AgentChatPanel(context.globalState, context.secrets, () => {
    dashboardPanel.pushTokenWatch();
  });
  registerGenieEntry(context, agentChatPanel, output);

  const panels: PanelBundle = {
    dashboardPanel,
    agentChatPanel,
    tasksListPanel,
    queryPanel,
    taskBotPanel,
    detailsPanel,
    tasksTreeProvider,
  };


  const bugWatch = new BugWatchService(
    authService,
    workItemService,
    hubClient,
    notifications,
    context,
    output
  );
  bugWatch.setProgressPanel(autopilotProgress);

  const autoCodeFix = new AutoCodeFixService(
    context.secrets,
    authService,
    workItemService,
    new GitBranchService(),
    notifications,
    output,
    autopilotProgress
  );
  bugWatch.setAutoCodeFix(autoCodeFix);

  setExtensionPanels(panels);
  registerCommands(
    context,
    authService,
    workItemService,
    selectionService,
    panels,
    hubClient,
    bugWatch,
    notifications,
    autoCodeFix,
    projectConnectService
  );

  const projectStatusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    60
  );
  projectStatusItem.command = 'devopsQuickUpdate.connectProjectCode';
  const updateProjectStatusBar = (): void => {
    const code = getActiveProjectCode();
    const cfg = loadWorkspaceProjectConfig();
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      updateProjectStatusBar();
      workItemService.resetClient();
      await dashboardPanel.refresh();
      await tasksListPanel.refresh();
      await queryPanel.refresh();
      tasksTreeProvider.refresh();
      void navigationView.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (
        event.affectsConfiguration('devopsQuickUpdate') ||
        event.affectsConfiguration('devopsQuickUpdate.projectCode')
      ) {
        updateProjectStatusBar();
        workItemService.resetClient();
        await dashboardPanel.refresh();
        await tasksListPanel.refresh();
        tasksTreeProvider.refresh();
        void navigationView.refresh();
      }
    })
  );

  const guide = new FlowGuidePanel(context.globalState);
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.OPEN_GUIDE, async () => {
      await guide.show();
    })
  );
  if (!FlowGuidePanel.wasSeen(context.globalState)) {
    void guide.show(true);
  } else {
    void promptConnectIfNeeded(authService, panels, hubClient);
  }
}

async function ensureHubEnabledGlobally(hubClient: HubClient): Promise<void> {
  if (!hubClient.isEnabled() && (await hubClient.hasApiKey())) {
    await vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .update('hub.enabled', true, vscode.ConfigurationTarget.Global);
  }
}

async function promptConnectIfNeeded(
  authService: AuthService,
  panels: PanelBundle,
  hubClient: HubClient
): Promise<void> {
  const isAuthenticated = await authService.isAuthenticated();
  const workspaceLabel = authService.getWorkspaceLabel();

  if (!isAuthenticated) {
    const connect = await vscode.window.showInformationMessage(
      `RubiOps (${workspaceLabel}): Connect to Azure DevOps. You need an organization URL and a Personal Access Token (PAT) from Azure DevOps user settings.`,
      'Connect',
      'How to get PAT'
    );
    if (connect === 'Connect') {
      await vscode.commands.executeCommand('devopsQuickUpdate.connect');
    } else if (connect === 'How to get PAT') {
      const { openPatHelpPage } = await import('./utils/connectGuide');
      await openPatHelpPage();
      await vscode.commands.executeCommand('devopsQuickUpdate.connect');
    }
    return;
  }

  await panels.dashboardPanel.show();

  if (!hubClient.isEnabled() && !(await hubClient.hasApiKey())) {
    const connectHub = await vscode.window.showInformationMessage(
      'Connect RubiOps Hub to sync coding time and productivity to your server?',
      'Connect Hub',
      'Later'
    );
    if (connectHub === 'Connect Hub') {
      await vscode.commands.executeCommand('devopsQuickUpdate.connectHub');
    }
  }
}

export function deactivate(): void {}
