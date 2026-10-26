import * as vscode from 'vscode';
import { PanelBundle } from '../panelBundle';
import { AuthService } from '../auth/authService';
import { WorkItemTreeItem } from '../providers/tasksTreeProvider';
import { ValidTransitionContext } from '../models/workItemState';
import { SelectionService } from '../services/selectionService';
import { WorkItemService } from '../services/workItemService';
import { COMMANDS } from '../utils/constants';
import { resolveWorkItemCommandRef } from '../utils/workItemCommandArgs';
import { copyAiPrompt, copyOrOpenAiPrompt } from '../services/aiAgentLauncher';
import { HubClient } from '../services/hubClient';
import { runRefreshAll } from '../extensionState';
import { BugWatchService, runBrokenVerifyCommand } from '../services/bugWatchService';
import { NotificationService } from '../services/notificationService';
import { BugWorkPlanService } from '../services/bugWorkPlanService';
import { upsertDescriptionBlock } from '../utils/descriptionBlocks';
import { AutoCodeFixService } from '../services/autoCodeFixService';
import { ProjectConnectService } from '../services/projectConnectService';
import { EngineeringFlowClient } from '../services/engineeringFlowClient';
import { readTokenBudget } from '../services/tokenOptimizer';
import { ReviewService } from '../services/reviewService';
import { FlutterRefactorService } from '../services/flutterRefactorService';
import { RefactorPreviewPanel } from '../views/refactorPreviewPanel';

export function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  workItemService: WorkItemService,
  selectionService: SelectionService,
  panels: PanelBundle,
  hubClient: HubClient,
  bugWatch?: BugWatchService,
  notifications?: NotificationService,
  autoCodeFix?: AutoCodeFixService,
  projectConnectService?: ProjectConnectService
): void {
  const { dashboardPanel, agentChatPanel, tasksListPanel, queryPanel, taskBotPanel, detailsPanel, tasksTreeProvider } = panels;
  const flowClient = new EngineeringFlowClient();
  const refactorService = new FlutterRefactorService();
  const review = new ReviewService(authService, context.secrets, context.globalState, refactorService, context.extensionUri);
  context.subscriptions.push({ dispose: () => review.dispose() });

  const refactorPreviewProvider = new RefactorPreviewPanel(context.extensionUri, refactorService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(RefactorPreviewPanel.viewType, refactorPreviewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CONNECT_PROJECT_CODE, async (code?: string) => {
      const runner = projectConnectService ?? new ProjectConnectService(vscode.window.createOutputChannel('RubiOps'));
      const ok = await runner.promptAndConnect(code);
      if (ok) {
        workItemService.resetClient();
        await dashboardPanel.refresh();
        await tasksListPanel.refresh();
        tasksTreeProvider.refresh();
      }
    }),

    vscode.commands.registerCommand(COMMANDS.WHY_DELAYED, async (itemId?: string) => {
      await flowClient.diagnoseWhyDelayed(itemId);
    }),

    vscode.commands.registerCommand(COMMANDS.TODAY_QUEUE, async () => {
      await flowClient.showTodayQueue();
    }),

    vscode.commands.registerCommand(COMMANDS.GENERATE_TESTS, async () => {
      await flowClient.generateTestCasesFromRequirement();
    }),

    vscode.commands.registerCommand(COMMANDS.DEVELOPER_CHECKLIST, async () => {
      await flowClient.generateDeveloperChecklist();
    }),

    vscode.commands.registerCommand(COMMANDS.RUN_TEST_COMMANDER, async (requirement?: string) => {
      await flowClient.runTestCommander(requirement);
    }),

    vscode.commands.registerCommand(COMMANDS.CONNECT, async () => {
      const connected = await authService.promptForCredentials();
      if (!connected) {
        return;
      }

      try {
        workItemService.resetClient();
        await workItemService.testConnection();
        vscode.window.showInformationMessage(
          `Connected to Azure DevOps for "${authService.getWorkspaceLabel()}".`
        );
        await dashboardPanel.show();
        await runRefreshAll();
        hubClient.track({
          platform: 'ado',
          category: 'activity',
          action: 'ado.activity.connected',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        await authService.clearPat();
        workItemService.resetClient();
        const message = error instanceof Error ? error.message : 'Connection failed';
        vscode.window.showErrorMessage(`Failed to connect: ${message}`);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_DASHBOARD, async () => {
      await dashboardPanel.show();
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_AGENT, async () => {
      await agentChatPanel.show();
    }),

    vscode.commands.registerCommand(COMMANDS.CODE_REVIEW, async () => {
      await review.startCodeReview();
    }),

    vscode.commands.registerCommand(COMMANDS.MERGE_REVIEW, async () => {
      await review.startMergeReview();
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_LAST_REPORT, async () => {
      await review.openLastReport();
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_REFACTOR_PREVIEW, async () => {
      await refactorService.scanWorkspace();
      await RefactorPreviewPanel.show(context.extensionUri, refactorService);
    }),

    vscode.commands.registerCommand(COMMANDS.SHOW_TOKEN_BUDGET, async () => {
      const budget = readTokenBudget();
      const status = budget.exhausted
        ? 'Daily budget is used up and resets tomorrow.'
        : budget.nearLimit
          ? 'Near the daily limit, so new prompts are compressed and large requests are downgraded.'
          : 'Queries are capped and long prompts are trimmed before they are sent.';
      vscode.window.showInformationMessage(
        `Token budget — used ${budget.usedToday.toLocaleString()} · remaining ${budget.remaining.toLocaleString()} of ${budget.dailyBudget.toLocaleString()} · est. cost $${budget.costToday.toFixed(4)} · ${budget.requestsToday} requests. ${status}`
      );
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_TASKS, async () => {
      await tasksListPanel.show();
    }),

    vscode.commands.registerCommand(COMMANDS.FOCUS_TASKS_TREE, async () => {
      await vscode.commands.executeCommand('devopsQuickUpdate.tasks.focus');
      tasksTreeProvider.refresh();
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_QUERY, async () => {
      await queryPanel.show();
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_TASK_BOT, async () => {
      await taskBotPanel.show();
    }),

    vscode.commands.registerCommand(COMMANDS.START_WORK, async () => {
      await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }),

    vscode.commands.registerCommand(COMMANDS.COMPLETE, async () => {
      await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }),

    vscode.commands.registerCommand(COMMANDS.BLOCKED, async () => {
      await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }),

    vscode.commands.registerCommand(COMMANDS.CHANGE_STATE, async (item?: number | WorkItemTreeItem) => {
      const ref = resolveWorkItemCommandRef(item);
      if (ref) {
        selectionService.select(ref.id, ref.title ?? `#${ref.id}`);
      }
      await changeWorkItemState(workItemService, selectionService, panels, hubClient);
    }),

    vscode.commands.registerCommand(
      COMMANDS.OPEN_WORK_ITEM,
      async (item?: number | WorkItemTreeItem, title?: string) => {
        const ref = resolveWorkItemCommandRef(item, title);

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
      }
    ),

    vscode.commands.registerCommand(COMMANDS.COPY_STANDUP, async () => {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate standup';
        vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.COPY_COMMIT_MESSAGE, async (workItemId?: number) => {
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
          vscode.window.showWarningMessage(
            'Select a task, use a branch with a work item ID, or open the dashboard for AI suggestions.'
          );
          return;
        }
        const message = await workItemService.getCommitMessageForWorkItem(id);
        await vscode.env.clipboard.writeText(message);
        vscode.window.showInformationMessage(`Copied commit message: ${message}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to copy commit message';
        vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.COPY_AI_PROMPT, async (workItemId?: number) => {
      try {
        const id = await resolveWorkItemIdForAi(workItemId, selectionService, workItemService);
        if (!id) {
          return;
        }
        const prompt = await workItemService.getTaskImplementationPrompt(id);
        await copyAiPrompt(prompt);
        hubClient.track({
          platform: 'vscode',
          category: 'output',
          action: 'vscode.output.ai_prompt_copied',
          timestamp: new Date().toISOString(),
          workItemId: id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to copy AI prompt';
        vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_AI_AGENT, async (workItemId?: number) => {
      try {
        const id = await resolveWorkItemIdForAi(workItemId, selectionService, workItemService);
        if (!id) {
          return;
        }
        const prompt = await workItemService.getTaskImplementationPrompt(id);
        await copyOrOpenAiPrompt(prompt);
        hubClient.track({
          platform: 'vscode',
          category: 'output',
          action: 'vscode.output.ai_agent_opened',
          timestamp: new Date().toISOString(),
          workItemId: id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open AI agent';
        vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_RECOMMENDED, async () => {
      try {
        const insights = await workItemService.getSmartInsights();
        if (!insights.recommended) {
          vscode.window.showInformationMessage('No task recommendation available right now.');
          return;
        }
        await detailsPanel.show(insights.recommended.workItem.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open recommended task';
        vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.OPEN_BRANCH_WORK_ITEM, async () => {
      try {
        const insights = await workItemService.getSmartInsights();
        const id = insights.gitContext.linkedWorkItemId;
        if (!id) {
          vscode.window.showWarningMessage(
            'Current git branch does not contain a detectable work item ID.'
          );
          return;
        }
        await detailsPanel.show(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open branch work item';
        vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.CONNECT_HUB, async () => {
      const ok = await hubClient.configureApiKey();
      if (ok) {
        await dashboardPanel.refresh();
      }
    }),

    vscode.commands.registerCommand(COMMANDS.DISCONNECT_HUB, async () => {
      await hubClient.disconnect();
      vscode.window.showInformationMessage('RubiOps Hub disconnected.');
      await dashboardPanel.refresh();
    }),

    vscode.commands.registerCommand(COMMANDS.RUN_BUG_WATCH, async () => {
      if (!bugWatch) {
        vscode.window.showWarningMessage('Bug Watch is not available.');
        return;
      }
      // Full-screen Autopilot progress panel — no tiny corner notification.
      await bugWatch.pollNow(true);
      await dashboardPanel.refresh();
    }),

    vscode.commands.registerCommand(COMMANDS.VERIFY_BROKEN_ISSUE, async (id?: number) => {
      const notify = notifications ?? new NotificationService();
      const selectedId =
        typeof id === 'number' ? id : selectionService.getSelected()?.id;
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
        await runBrokenVerifyCommand(workItemService, notify, hubClient, selectedId);
        await dashboardPanel.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Verify failed: ${message}`);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.BUILD_BUG_WORK_PLAN, async (id?: number) => {
      const selectedId =
        typeof id === 'number' ? id : selectionService.getSelected()?.id;
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
        const plan = new BugWorkPlanService().buildPlan(workItem);
        const next = upsertDescriptionBlock(workItem.description, 'Work Plan', plan.plainText);
        await client.updateWorkItemDescription(workItem.id, next);
        const notify = notifications ?? new NotificationService();
        notify.toast(`Work plan written to #${workItem.id} Description (no comment).`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Build work plan failed: ${message}`);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.SET_CURSOR_API_KEY, async () => {
      if (!autoCodeFix) {
        vscode.window.showWarningMessage('Auto Code Fix is not available.');
        return;
      }
      await autoCodeFix.promptAndStoreCursorApiKey();
    }),

    vscode.commands.registerCommand(COMMANDS.AUTO_CODE_FIX, async (id?: number) => {
      if (!autoCodeFix) {
        vscode.window.showWarningMessage('Auto Code Fix is not available.');
        return;
      }
      const selectedId =
        typeof id === 'number' ? id : selectionService.getSelected()?.id;
      if (!selectedId) {
        vscode.window.showWarningMessage(
          'Select a work item first (open Details), or pass a work item id.'
        );
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Run unattended Auto Code Fix on #${selectedId}?\n\n` +
          `Workspace must be the target git repo. This will create a branch, run Cursor SDK, commit, push, and open an Azure DevOps PR.`,
        { modal: true },
        'Run Auto Code Fix'
      );
      if (confirm !== 'Run Auto Code Fix') {
        return;
      }
      const result = await autoCodeFix.run(selectedId);
      if (result.ok) {
        await dashboardPanel.refresh();
      }
    })
  );
}

async function changeWorkItemState(
  workItemService: WorkItemService,
  selectionService: SelectionService,
  panels: PanelBundle,
  hubClient: HubClient
): Promise<void> {
  const selected = selectionService.getSelected();
  if (!selected) {
    const openTasks = await vscode.window.showWarningMessage(
      'No task selected. Open My Tasks and select a task first.',
      'Open My Tasks'
    );
    if (openTasks === 'Open My Tasks') {
      await panels.tasksListPanel.show();
    }
    return;
  }

  try {
    const context = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading valid transitions for #${selected.id}...`,
      },
      async () => workItemService.getValidTransitionContext(selected.id)
    );

    const targetState = await pickValidState(context);
    if (!targetState) {
      return;
    }

    const saveResult = await workItemService.saveWorkItemChanges(selected.id, { state: targetState });

    if (saveResult.stateChanged && saveResult.newState) {
      await workItemService.promptBranchAfterStateChange(
        saveResult.workItem,
        saveResult.newState
      );
      hubClient.track({
        platform: 'vscode',
        category: 'output',
        action: 'vscode.output.workitem_state_changed',
        timestamp: new Date().toISOString(),
        workItemId: selected.id,
        metadata: { newState: saveResult.newState },
      });
    }

    vscode.window.showInformationMessage(
      `Work item #${selected.id} updated to "${targetState}".`
    );

    await panels.dashboardPanel.refresh();
    await panels.tasksListPanel.refresh();
    await panels.queryPanel.refresh();
    panels.tasksTreeProvider.refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    vscode.window.showErrorMessage(`Failed to update work item: ${message}`);
  }
}

async function pickValidState(context: ValidTransitionContext): Promise<string | undefined> {
  const parentInfo = context.parentTitle
    ? `Parent: ${context.parentType ?? 'Item'} #${context.parentId} (${context.parentState})`
    : 'No parent';

  const selection = await vscode.window.showQuickPick(
    context.validStates.map((state) => ({
      label: state.name,
      description: `${context.workItemType} · ${state.category}`,
      detail: parentInfo,
      stateName: state.name,
    })),
    {
      title: 'Change State (from org workflow)',
      placeHolder:
        `${context.workItemType} #${context.workItemId}: ${context.currentState} → select valid transition`,
      ignoreFocusOut: true,
    }
  );

  return selection?.stateName;
}

async function resolveWorkItemIdForAi(
  workItemId: number | undefined,
  selectionService: SelectionService,
  workItemService: WorkItemService
): Promise<number | undefined> {
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
