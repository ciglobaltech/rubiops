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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPanel = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const workspaceConfig_1 = require("../utils/workspaceConfig");
const constants_1 = require("../utils/constants");
const dates_1 = require("../utils/dates");
const html_1 = require("../utils/html");
const panelStyles_1 = require("./panelStyles");
const connectGuideHtml_1 = require("./connectGuideHtml");
const connectGuide_1 = require("../utils/connectGuide");
const workItemStatus_1 = require("../utils/workItemStatus");
const tokenOptimizer_1 = require("../services/tokenOptimizer");
const DASHBOARD_FILTER_KEY = 'devopsQuickUpdate.dashboard.activeFilter';
const DEFAULT_DASHBOARD_FILTER = 'today-todo';
function compactTokens(value) {
    if (value >= 1000) {
        const scaled = value / 1000;
        return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)}k`;
    }
    return String(value);
}
class DashboardPanel {
    workItemService;
    authService;
    selectionService;
    extensionContext;
    hubClient;
    static viewType = 'devopsQuickUpdate.dashboard';
    panel;
    constructor(workItemService, authService, selectionService, extensionContext, hubClient) {
        this.workItemService = workItemService;
        this.authService = authService;
        this.selectionService = selectionService;
        this.extensionContext = extensionContext;
        this.hubClient = hubClient;
    }
    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            await this.refresh();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(DashboardPanel.viewType, 'RubiOps Dashboard', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'command' && typeof message.command === 'string') {
                await vscode.commands.executeCommand(message.command);
            }
            if (message.type === 'open' && typeof message.id === 'number') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_WORK_ITEM, message.id);
            }
            if (message.type === 'connect') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.CONNECT);
            }
            if (message.type === 'openPatHelp') {
                await (0, connectGuide_1.openPatHelpPage)(this.authService.getOrganizationUrl());
            }
            if (message.type === 'refresh') {
                await this.refresh();
            }
            if (message.type === 'copyStandup') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.COPY_STANDUP);
            }
            if (message.type === 'copyCommit' && typeof message.id === 'number') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.COPY_COMMIT_MESSAGE, message.id);
            }
            if (message.type === 'openRecommended' && typeof message.id === 'number') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_WORK_ITEM, message.id);
            }
            if (message.type === 'openBranchItem') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_BRANCH_WORK_ITEM);
            }
            if (message.type === 'saveFilter' && typeof message.key === 'string') {
                await this.extensionContext.globalState.update(DASHBOARD_FILTER_KEY, message.key);
            }
            if (message.type === 'connectHub') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.CONNECT_HUB);
                await this.refresh();
            }
            const rawHub = vscode.workspace
                .getConfiguration('devopsQuickUpdate')
                .get('hub.apiUrl', 'http://staging.rupos.app/AI/index.php/v1');
            const hubUrl = (0, workspaceConfig_1.normalizeHubApiUrl)(rawHub);
            if (message.type === 'connectProjectCode') {
                await vscode.commands.executeCommand(constants_1.COMMANDS.CONNECT_PROJECT_CODE);
                await this.refresh();
            }
            if (message.type === 'switchRole' && typeof message.role === 'string') {
                await this.extensionContext.globalState.update('rubiops.activeRole', message.role);
                await this.extensionContext.globalState.update('smartgenie.activeRole', message.role);
                this.panel?.webview.postMessage({ type: 'roleSwitched', role: message.role });
            }
            if (message.type === 'runTestCommander') {
                try {
                    const res = await axios_1.default.post(`${hubUrl}/agents/orchestrate`, {
                        requirement: message.requirement,
                        platform: message.platform || 'Web',
                        environment: message.environment || 'QA Staging',
                        mode: message.mode || 'mvp',
                    });
                    this.panel?.webview.postMessage({ type: 'testCommanderResult', data: res.data });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Orchestration network error';
                    this.panel?.webview.postMessage({ type: 'testCommanderError', error: msg });
                }
            }
            if (message.type === 'diagnoseWhyDelayed') {
                try {
                    const res = await axios_1.default.post(`${hubUrl}/flow/why-delayed`, {
                        itemId: message.itemId || 'TASK-1024',
                    });
                    this.panel?.webview.postMessage({ type: 'whyDelayedResult', data: res.data });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Diagnosis error';
                    this.panel?.webview.postMessage({ type: 'whyDelayedError', error: msg });
                }
            }
            if (message.type === 'fetchWaitingMatrix') {
                try {
                    const res = await axios_1.default.get(`${hubUrl}/flow/waiting-matrix`);
                    this.panel?.webview.postMessage({ type: 'waitingMatrixResult', data: res.data });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Waiting matrix error';
                    this.panel?.webview.postMessage({ type: 'waitingMatrixError', error: msg });
                }
            }
            if (message.type === 'fetchAttentionInbox') {
                try {
                    const res = await axios_1.default.get(`${hubUrl}/flow/attention-inbox`);
                    this.panel?.webview.postMessage({ type: 'attentionInboxResult', data: res.data });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Attention inbox error';
                    this.panel?.webview.postMessage({ type: 'attentionInboxError', error: msg });
                }
            }
            if (message.type === 'fetchHandoff') {
                try {
                    const res = await axios_1.default.get(`${hubUrl}/flow/handoff`, {
                        params: { flow: message.flow || 'dev-to-qa' },
                    });
                    this.panel?.webview.postMessage({ type: 'handoffResult', data: res.data });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Handoff scorecard error';
                    this.panel?.webview.postMessage({ type: 'handoffError', error: msg });
                }
            }
            if (message.type === 'fetchRegistry') {
                try {
                    const res = await axios_1.default.get(`${hubUrl}/agents/registry`);
                    this.panel?.webview.postMessage({ type: 'agentRegistryResult', data: res.data });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Registry error';
                    this.panel?.webview.postMessage({ type: 'agentRegistryError', error: msg });
                }
            }
            if (message.type === 'fetchTodayQueue') {
                try {
                    const res = await axios_1.default.get(`${hubUrl}/flow/today-queue`, {
                        params: { role: message.role || 'DEVELOPER', email: message.email || '' },
                    });
                    this.panel?.webview.postMessage({ type: 'todayQueueResult', data: res.data });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Today queue error';
                    this.panel?.webview.postMessage({ type: 'todayQueueError', error: msg });
                }
            }
        });
        await this.refresh();
    }
    pushTokenWatch() {
        if (!this.panel) {
            return;
        }
        this.panel.webview.postMessage({
            type: 'tokenWatch',
            days: (0, tokenOptimizer_1.readTokenHistory)(7),
            budget: tokenOptimizer_1.DAILY_TOKEN_BUDGET,
        });
    }
    async refresh() {
        if (!this.panel) {
            return;
        }
        const isAuthenticated = await this.authService.isAuthenticated();
        if (!isAuthenticated) {
            this.panel.webview.html = this.getConnectHtml();
            return;
        }
        try {
            this.panel.webview.html = this.getLoadingHtml();
            const data = await this.workItemService.getDashboardData();
            const insights = await this.workItemService.buildSmartInsights(data);
            const hubDay = await this.hubClient.getDaySummary();
            const selected = this.selectionService.getSelected();
            const workspaceLabel = this.authService.getWorkspaceLabel();
            const orgUrl = this.authService.getOrganizationUrl() ?? '';
            const projectName = this.authService.getProjectName() ?? '';
            const activeFilter = this.extensionContext.globalState.get(DASHBOARD_FILTER_KEY, DEFAULT_DASHBOARD_FILTER);
            const projectCfg = (0, workspaceConfig_1.loadWorkspaceProjectConfig)();
            const currentRole = this.extensionContext.globalState.get('rubiops.activeRole') || this.extensionContext.globalState.get('smartgenie.activeRole') || projectCfg?.role || 'DEVELOPER';
            const projectCode = projectCfg?.projectCode || 'SG-CORE-1001';
            const userEmail = projectCfg?.userEmail || '';
            const rawHub = vscode.workspace.getConfiguration('devopsQuickUpdate').get('hub.apiUrl', 'http://staging.rupos.app/AI/index.php/v1');
            const hubUrl = (0, workspaceConfig_1.normalizeHubApiUrl)(rawHub);
            this.panel.webview.html = this.getDashboardHtml(data, insights, hubDay, selected, {
                workspaceLabel,
                orgUrl,
                projectName,
                activeFilter,
                currentRole,
                projectCode,
                userEmail,
                hubUrl,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load dashboard';
            this.panel.webview.html = this.getErrorHtml(message);
        }
    }
    getLoadingHtml() {
        return `<!DOCTYPE html><html><body><div class="center">Loading dashboard...</div></body></html>`;
    }
    getConnectHtml() {
        return (0, connectGuideHtml_1.renderConnectGuideHtml)({
            workspaceLabel: this.authService.getWorkspaceLabel(),
            showConnectButton: true,
        });
    }
    getErrorHtml(message) {
        return `<!DOCTYPE html><html><body><div class="center">${(0, html_1.escapeHtml)(message)}</div></body></html>`;
    }
    slugify(value) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
    }
    buildFilters(data) {
        const plan = data.dailyPlan;
        const allOverdue = data.allOverdue;
        const allDueToday = data.allDueToday;
        const allClosedToday = data.allClosedToday;
        const todayOpen = plan.today.actionItems.filter((item) => ['incomplete', 'overdue', 'in-progress', 'planned'].includes(item.timeStatus));
        const todayDone = allClosedToday;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const base = [];
        if (data.currentSprint) {
            const sprintItems = (data.currentSprintItems && data.currentSprintItems.length > 0)
                ? data.currentSprintItems
                : data.allPending.filter((item) => {
                    const normItem = item.iterationPath.replace(/^\\+/, '').toLowerCase();
                    const normPath = data.currentSprint.path.replace(/^\\+/, '').toLowerCase();
                    const normName = data.currentSprint.name.toLowerCase();
                    return (normItem === normPath ||
                        normItem.endsWith('\\' + normName) ||
                        normItem === normName);
                });
            base.push({
                key: 'current-sprint',
                label: `🏃 ${data.currentSprint.name}`,
                hint: `Active Sprint: ${data.currentSprint.name} (${sprintItems.length} work items)`,
                items: this.toFilterItems(sprintItems),
            });
            if (data.storyCount > 0) {
                base.push({
                    key: 'filter-stories',
                    label: '📖 Stories',
                    hint: `${data.storyCount} User Stories in active sprint / backlog`,
                    items: this.toFilterItems(data.stories),
                });
            }
            if (data.taskCount > 0) {
                base.push({
                    key: 'filter-tasks',
                    label: '📋 Tasks',
                    hint: `${data.taskCount} Tasks in active sprint / backlog`,
                    items: this.toFilterItems(data.tasks),
                });
            }
            if (data.bugCount > 0) {
                base.push({
                    key: 'filter-bugs',
                    label: '🐛 Bugs',
                    hint: `${data.bugCount} Bugs in active sprint / backlog`,
                    items: this.toFilterItems(data.bugs),
                });
            }
        }
        base.push({
            key: 'today-plan',
            label: 'Today',
            hint: 'Open work on the left · Done today on the right',
            split: true,
            overdueItems: this.toFilterItems(todayOpen),
            dueTodayItems: this.toFilterItems(todayDone, 'completed', 'Done today'),
            items: this.mergeUnique([...todayOpen, ...todayDone]),
        }, {
            key: 'today-todo',
            label: 'Work Now',
            hint: 'Overdue on the left · Due today on the right',
            split: true,
            overdueItems: this.toFilterItems(allOverdue, 'overdue', 'Overdue'),
            dueTodayItems: this.toFilterItems(allDueToday, 'incomplete', 'Due today'),
            items: this.mergeUnique([...allOverdue, ...allDueToday]),
        }, {
            key: 'overdue',
            label: 'Overdue',
            hint: 'Past due — handle these first',
            items: this.toFilterItems(allOverdue, 'overdue', 'Overdue'),
        }, {
            key: 'due-today',
            label: 'Due Today',
            hint: 'Due date is today',
            items: this.toFilterItems(allDueToday, 'incomplete', 'Due today'),
        }, {
            key: 'today-done',
            label: 'Done Today',
            hint: 'Tasks you closed or completed today',
            items: this.toFilterItems(allClosedToday, 'completed', 'Done today'),
        }, {
            key: 'in-progress',
            label: 'In Progress',
            hint: 'Currently active work',
            items: this.toFilterItems(data.allPending.filter((item) => item.stateCategory === 'InProgress')),
        }, {
            key: 'blocked',
            label: 'Blocked',
            hint: 'Waiting on dependency or review',
            items: this.toFilterItems(data.allPending.filter((item) => item.state.toLowerCase().includes('block'))),
        }, {
            key: 'today-waiting',
            label: 'On Hold',
            hint: 'No action needed right now',
            items: this.toFilterItems(plan.today.waitingItems),
        }, {
            key: 'tomorrow',
            label: 'Tomorrow',
            hint: 'Planned for tomorrow',
            items: this.toFilterItems(plan.tomorrow.items),
        }, {
            key: 'yesterday',
            label: 'Yesterday',
            hint: 'What you worked on yesterday',
            items: this.toFilterItems(plan.yesterday.items),
        }, {
            key: 'high-priority',
            label: 'High Priority',
            hint: 'Priority 1–2 items',
            items: this.toFilterItems(data.allPending.filter((item) => {
                const p = Number(item.priority);
                return !Number.isNaN(p) && p <= 2;
            })),
        }, {
            key: 'stale',
            label: 'Stale',
            hint: 'No updates in 7+ days',
            items: this.toFilterItems(data.allPending.filter((item) => {
                const changed = new Date(item.changedDate);
                const diff = today.getTime() - changed.setHours(0, 0, 0, 0);
                return diff >= 7 * 24 * 60 * 60 * 1000;
            })),
        }, {
            key: 'due-week',
            label: 'This Week',
            hint: 'Due in the next 7 days',
            items: this.toFilterItems(data.allPending.filter((item) => {
                if (!item.dueDate)
                    return false;
                const due = new Date(item.dueDate);
                due.setHours(0, 0, 0, 0);
                const weekEnd = new Date(today);
                weekEnd.setDate(weekEnd.getDate() + 7);
                return due > today && due <= weekEnd;
            })),
        }, {
            key: 'pending',
            label: 'All Pending',
            hint: 'All open items assigned to you',
            items: this.toFilterItems(data.allPending),
        });
        for (const group of data.byWorkItemType) {
            base.push({
                key: `type-${this.slugify(group.label)}`,
                label: group.label,
                hint: `${group.count} ${group.label} item(s) assigned to you`,
                items: this.toFilterItems(data.allPending.filter((item) => item.workItemType === group.label)),
            });
        }
        for (const group of data.byState) {
            base.push({
                key: `state-${this.slugify(group.label)}`,
                label: group.label,
                hint: `${group.count} item(s) in state "${group.label}"`,
                items: this.toFilterItems(data.allPending.filter((item) => item.state === group.label)),
            });
        }
        for (const group of data.byIteration) {
            const shortName = group.label.split('\\').pop() ?? group.label;
            base.push({
                key: `sprint-${this.slugify(group.label)}`,
                label: shortName,
                hint: `${group.count} item(s) in ${shortName}`,
                items: this.toFilterItems(data.allPending.filter((item) => item.iterationPath === group.label)),
            });
        }
        return base;
    }
    buildCompactFilterPayload(data) {
        const itemsById = {};
        const storeItems = (items) => {
            for (const item of items) {
                const existing = itemsById[item.id];
                if (!existing) {
                    itemsById[item.id] = { ...item };
                    continue;
                }
                if (item.statusLabel) {
                    existing.statusLabel = item.statusLabel;
                }
                if (item.timeStatus) {
                    existing.timeStatus = item.timeStatus;
                }
                if (item.classification) {
                    existing.classification = item.classification;
                }
                if (item.assignedTo) {
                    existing.assignedTo = item.assignedTo;
                }
            }
            return items.map((item) => item.id);
        };
        const filters = this.buildFilters(data).map((filter) => ({
            key: filter.key,
            label: filter.label,
            hint: filter.hint,
            split: filter.split,
            itemIds: storeItems(filter.items),
            overdueIds: filter.overdueItems ? storeItems(filter.overdueItems) : undefined,
            dueTodayIds: filter.dueTodayItems ? storeItems(filter.dueTodayItems) : undefined,
            splitLeftLabel: filter.key === 'today-plan'
                ? 'To Do Today'
                : filter.key === 'today-todo'
                    ? 'Overdue'
                    : undefined,
            splitRightLabel: filter.key === 'today-plan'
                ? 'Done Today'
                : filter.key === 'today-todo'
                    ? 'Due Today'
                    : undefined,
        }));
        return { itemsById, filters };
    }
    mergeUnique(items) {
        const seen = new Set();
        const result = [];
        for (const item of items) {
            if (!seen.has(item.id)) {
                seen.add(item.id);
                result.push(this.toFilterItem(item));
            }
        }
        return result;
    }
    toFilterItems(items, timeStatus, statusLabel) {
        return items.map((item) => this.toFilterItem(item, timeStatus, statusLabel));
    }
    toFilterItem(item, timeStatus, statusLabel) {
        const timed = item;
        const classification = item.classification ?? (0, workItemStatus_1.classifyWorkItemType)(item.workItemType);
        return {
            id: item.id,
            title: item.title,
            state: item.state,
            workItemType: item.workItemType,
            statusLabel: statusLabel ?? timed.statusLabel,
            timeStatus: timeStatus ?? timed.timeStatus,
            dueDate: item.dueDate,
            classification,
            assignedTo: item.assignedTo,
        };
    }
    renderFilterItemsHtml(items, emptyMsg) {
        if (items.length === 0) {
            return `<li class="empty-item">${(0, html_1.escapeHtml)(emptyMsg)}</li>`;
        }
        return items
            .map((item) => {
            const due = item.dueDate
                ? ` · Due ${(0, html_1.escapeHtml)(new Date(item.dueDate).toLocaleDateString())}`
                : '';
            const status = (0, html_1.escapeHtml)(item.statusLabel || item.state);
            const statusClass = item.timeStatus ? `status-${item.timeStatus}` : '';
            return `<li class="work-item ${statusClass}" onclick="openItem(${item.id})">
          <div class="wi-top"><span class="wi-id">#${item.id}</span><span class="wi-pill">${status}</span></div>
          <div class="wi-title">${(0, html_1.escapeHtml)(item.title)}</div>
          <div class="wi-meta">${(0, html_1.escapeHtml)(item.workItemType)} · ${(0, html_1.escapeHtml)(item.state)}${due}</div>
        </li>`;
        })
            .join('');
    }
    renderStandupPreview(standupSummary) {
        const lines = standupSummary.split('\n');
        const sections = [];
        let current = [];
        const flush = () => {
            if (current.length > 0) {
                sections.push(current.join('\n'));
                current = [];
            }
        };
        for (const line of lines) {
            if (line.startsWith('✅') || line.startsWith('🔨') || line.startsWith('🚧') || line.startsWith('📋')) {
                flush();
            }
            current.push(line);
            if (line.startsWith('🧠')) {
                break;
            }
        }
        flush();
        const preview = sections
            .slice(0, 4)
            .map((section) => (0, html_1.escapeHtml)(section))
            .join('<br/><br/>');
        return preview || (0, html_1.escapeHtml)(lines.slice(0, 10).join('\n'));
    }
    renderTokenWatch() {
        const days = (0, tokenOptimizer_1.readTokenHistory)(7);
        const today = days[days.length - 1];
        const weekSaved = days.reduce((sum, day) => sum + day.saved, 0);
        const weekUsed = days.reduce((sum, day) => sum + day.used, 0);
        const rings = days
            .map((day) => {
            const date = new Date(`${day.date}T12:00:00`);
            const label = date.toLocaleDateString('en-US', { weekday: 'short' });
            const usedPct = Math.min(100, Math.round((day.used / tokenOptimizer_1.DAILY_TOKEN_BUDGET) * 100));
            const base = day.used + day.saved;
            const savedPct = base === 0 ? 0 : Math.min(100, Math.round((day.saved / base) * 100));
            const isToday = day.date === today.date;
            return `<div class="watch-day${isToday ? ' today' : ''}" data-date="${day.date}">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle class="ring-track" cx="18" cy="18" r="14" pathLength="100"></circle>
            <circle class="ring-used" cx="18" cy="18" r="14" pathLength="100" stroke-dasharray="${usedPct} 100"></circle>
            <circle class="ring-saved" cx="18" cy="18" r="10" pathLength="100" stroke-dasharray="${savedPct} 100"></circle>
          </svg>
          <strong>${compactTokens(day.saved)}</strong>
          <span>${label}</span>
        </div>`;
        })
            .join('');
        return `<section class="token-watch">
      <style>
        .token-watch {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 18px;
          align-items: center;
          margin: 0 0 18px;
          padding: 16px 18px;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 16px;
          background: var(--vscode-editorWidget-background);
        }
        .token-watch h2 { margin: 0 0 4px; font-size: 16px; }
        .token-watch .watch-kicker { margin: 0; color: var(--vscode-descriptionForeground); font-size: 12px; }
        .watch-stats { display: flex; gap: 16px; margin-top: 12px; }
        .watch-stats div { display: flex; flex-direction: column; }
        .watch-stats strong { font-size: 18px; }
        .watch-stats span { font-size: 11px; color: var(--vscode-descriptionForeground); }
        .watch-saved { color: #34d399; }
        .watch-week { display: flex; gap: 8px; justify-content: space-between; }
        .watch-day { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 52px; }
        .watch-day svg { width: 54px; height: 54px; transform: rotate(-90deg); }
        .watch-day.today svg { width: 68px; height: 68px; }
        .watch-day strong { font-size: 11px; color: #34d399; }
        .watch-day span { font-size: 10px; color: var(--vscode-descriptionForeground); }
        .ring-track { fill: none; stroke: rgba(128,128,128,0.25); stroke-width: 3; }
        .ring-used { fill: none; stroke: #38bdf8; stroke-width: 3; stroke-linecap: round; }
        .ring-saved { fill: none; stroke: #34d399; stroke-width: 3; stroke-linecap: round; }
        .watch-actions { margin-top: 12px; }
      </style>
      <div>
        <h2>Token watch</h2>
        <p class="watch-kicker">Outer ring is used. Inner ring is the share the chain kept off the model.</p>
        <div class="watch-stats">
          <div><strong id="token-used-today">${today.used.toLocaleString()}</strong><span>Used today</span></div>
          <div><strong id="token-saved-today" class="watch-saved">${today.saved.toLocaleString()}</strong><span>Saved today</span></div>
          <div><strong id="token-saved-week" class="watch-saved">${weekSaved.toLocaleString()}</strong><span>Saved this week</span></div>
        </div>
        <div class="watch-actions">
          <button class="ai-btn" onclick="run('${constants_1.COMMANDS.OPEN_AGENT}')">Ask the agent</button>
        </div>
      </div>
      <div class="watch-week" title="Week used ${weekUsed.toLocaleString()} tokens">${rings}</div>
    </section>`;
    }
    renderAiInsights(insights) {
        const recommended = insights.recommended;
        const git = insights.gitContext;
        const recommendedHtml = recommended
            ? `<div class="ai-card recommend">
          <div class="ai-card-head">
            <span class="ai-badge">Recommended Next</span>
            <span class="ai-score">Score ${recommended.score}</span>
          </div>
          <button class="ai-task-btn" onclick="openRecommended(${recommended.workItem.id})">
            <strong>#${recommended.workItem.id}</strong> ${(0, html_1.escapeHtml)(recommended.workItem.title)}
          </button>
          <p class="ai-reason">${(0, html_1.escapeHtml)(recommended.reason)}</p>
          <div class="ai-actions">
            <button class="ai-btn" onclick="openRecommended(${recommended.workItem.id})">Open Task</button>
            <button class="ai-btn secondary" onclick="copyCommit(${recommended.workItem.id})">Copy AB# Commit</button>
          </div>
        </div>`
            : `<div class="ai-card"><p class="ai-empty">No urgent task recommendation — you're caught up or on hold items only.</p></div>`;
        const gitHtml = git.isRepo
            ? `<div class="ai-card git">
          <div class="ai-card-head"><span class="ai-badge">Git Context</span></div>
          <p class="ai-git-branch">${(0, html_1.escapeHtml)(git.branchName ?? 'Detached HEAD')}</p>
          ${git.linkedWorkItemId
                ? `<button class="ai-btn" onclick="openBranchItem()">Open #${git.linkedWorkItemId} from branch</button>`
                : '<p class="ai-hint">Branch name has no work item ID — use feature/{id}-{title}</p>'}
        </div>`
            : `<div class="ai-card git"><p class="ai-hint">No git repo in workspace — branch linking unavailable</p></div>`;
        const alertsHtml = insights.alerts.length > 0
            ? `<ul class="ai-alerts">${insights.alerts
                .map((alert) => {
                const click = alert.filterKey
                    ? `onclick="openAlertFilter('${alert.filterKey}')"`
                    : alert.workItemId !== undefined
                        ? `onclick="openItem(${alert.workItemId})"`
                        : '';
                return `<li class="ai-alert ${alert.level}" ${click}>${(0, html_1.escapeHtml)(alert.message)}</li>`;
            })
                .join('')}</ul>`
            : '<p class="ai-hint">No alerts — workload looks manageable</p>';
        const mismatchHtml = insights.focusMismatch
            ? `<div class="ai-mismatch">${(0, html_1.escapeHtml)(insights.focusMismatch.message)}</div>`
            : '';
        const standupPreview = this.renderStandupPreview(insights.standupSummary);
        return `<section class="ai-section">
      <div class="ai-header">
        <div>
          <h2 class="ai-title">⚡ RubiOps</h2>
          <p class="ai-subtitle">Powered by RubiOps — real-time prioritization, git sync & standup</p>
        </div>
        <button class="ai-btn primary" onclick="copyStandup()">Copy Standup Summary</button>
      </div>
      ${mismatchHtml}
      <div class="ai-grid">
        ${recommendedHtml}
        ${gitHtml}
        <div class="ai-card alerts">
          <div class="ai-card-head"><span class="ai-badge">Real-time Alerts</span></div>
          ${alertsHtml}
        </div>
        <div class="ai-card standup">
          <div class="ai-card-head"><span class="ai-badge">Standup Preview</span></div>
          <div class="ai-standup-preview">${standupPreview}…</div>
        </div>
      </div>
    </section>`;
    }
    renderHubDaySection(hubDay) {
        if (!hubDay.connected) {
            return `<section class="hub-section">
        <div class="hub-header">
          <h2 class="section-title">📊 My Coding Day (Hub)</h2>
          <button class="ai-btn" onclick="connectHub()">Connect RubiOps Hub</button>
        </div>
        <p class="ai-hint">Sync coding time and work output to staging.rupos.app/AI</p>
      </section>`;
        }
        if (hubDay.error) {
            return `<section class="hub-section">
        <h2 class="section-title">📊 My Coding Day (Hub)</h2>
        <p class="ai-hint hub-err">${(0, html_1.escapeHtml)(hubDay.error)} — upload API to Hostinger and run setup.php</p>
      </section>`;
        }
        const m = hubDay.metrics;
        const p = hubDay.presence;
        if (!m) {
            return `<section class="hub-section">
        <div class="hub-header">
          <h2 class="section-title">📊 My Coding Day (Hub)</h2>
          <span class="hub-presence">Connected</span>
        </div>
        <div class="hub-stats">
          <div class="hub-stat"><b>0</b><span>Coding min</span></div>
          <div class="hub-stat"><b>0</b><span>Idle min</span></div>
          <div class="hub-stat"><b>0</b><span>Tasks closed</span></div>
          <div class="hub-stat"><b>0</b><span>File saves</span></div>
          <div class="hub-stat"><b>0</b><span>Output score</span></div>
          <div class="hub-stat"><b>0</b><span>Events</span></div>
        </div>
        <p class="ai-hint">No events yet today — type in the editor for 2–3 minutes, then click Refresh.</p>
      </section>`;
        }
        const presenceLabel = p?.state ? (0, html_1.escapeHtml)(p.state) : 'unknown';
        const lastAt = m.lastActivityAt ? (0, html_1.escapeHtml)(m.lastActivityAt.slice(11, 19)) : '—';
        return `<section class="hub-section">
      <div class="hub-header">
        <h2 class="section-title">📊 My Coding Day (Hub)</h2>
        <span class="hub-presence">Now: <strong>${presenceLabel}</strong> · last ${lastAt}</span>
      </div>
      <div class="hub-stats">
        <div class="hub-stat"><b>${m.codingMinutes}</b><span>Coding min</span></div>
        <div class="hub-stat"><b>${m.idleMinutes}</b><span>Idle min</span></div>
        <div class="hub-stat"><b>${m.tasksClosed}</b><span>Tasks closed</span></div>
        <div class="hub-stat"><b>${m.fileSaves}</b><span>File saves</span></div>
        <div class="hub-stat"><b>${m.outputScore}</b><span>Output score</span></div>
        <div class="hub-stat"><b>${m.eventCount}</b><span>Events</span></div>
      </div>
      <p class="ai-hint">Synced to RubiOps Hub · <a href="http://staging.rupos.app/AI/" target="_blank">Open web portal</a></p>
    </section>`;
    }
    getSmartSummary(data, hubDay) {
        const todo = data.dailyPlan.today.incompleteCount;
        const doneToday = data.closedTodayCount;
        const overdue = data.overdueCount;
        const waiting = data.dailyPlan.today.waitingCount;
        const tomorrow = data.dailyPlan.tomorrow.totalCount;
        if (todo === 0 && overdue === 0) {
            if (doneToday > 0) {
                const base = `${doneToday} task(s) completed today. ${waiting > 0 ? `${waiting} on hold. ` : ''}${tomorrow} planned for tomorrow.`;
                return this.appendHubSummary(base, hubDay);
            }
            const base = waiting > 0
                ? `All clear for action today. ${waiting} item(s) on hold or blocked. ${tomorrow} planned for tomorrow.`
                : `You're all caught up today. ${tomorrow} item(s) planned for tomorrow.`;
            return this.appendHubSummary(base, hubDay);
        }
        if (overdue > 0) {
            const donePart = doneToday > 0 ? `, ${doneToday} done today` : '';
            const base = `Start here: ${overdue} overdue, ${todo} to do today${donePart}. Click a count below to filter and open tasks.`;
            return this.appendHubSummary(base, hubDay);
        }
        const donePart = doneToday > 0 ? ` · ${doneToday} done today` : '';
        const base = `${todo} task(s) need your work today${donePart}. Click any count to filter the list below.`;
        return this.appendHubSummary(base, hubDay);
    }
    appendHubSummary(base, hubDay) {
        if (!hubDay?.connected) {
            return base;
        }
        if (hubDay.error) {
            return `${base} · Hub: sync error — click Refresh or check API.`;
        }
        const mins = hubDay.metrics?.codingMinutes ?? 0;
        const events = hubDay.metrics?.eventCount ?? 0;
        if (events === 0) {
            return `${base} · Hub: connected — type in the editor 2–3 min to log coding time.`;
        }
        return `${base} · Hub today: ${mins} coding min, ${events} events.`;
    }
    getDashboardHtml(data, insights, hubDay, selected, workspace) {
        const filters = this.buildFilters(data);
        const filterPayload = this.buildCompactFilterPayload(data);
        const filterPayloadB64 = Buffer.from(JSON.stringify(filterPayload)).toString('base64');
        const initialActiveFilter = workspace?.activeFilter ?? DEFAULT_DASHBOARD_FILTER;
        const workNowFilter = filters.find((filter) => filter.key === 'today-todo');
        const initialOverdue = workNowFilter?.overdueItems ?? [];
        const initialDueToday = workNowFilter?.dueTodayItems ?? [];
        const initialWorkNowCount = initialOverdue.length + initialDueToday.length;
        const smartSummary = this.getSmartSummary(data, hubDay);
        const sprintCockpitSection = this.renderActiveSprintSection(data.currentSprint);
        const aiSection = this.renderAiInsights(insights);
        const hubSection = this.renderHubDaySection(hubDay);
        const currentRole = workspace?.currentRole || 'DEVELOPER';
        const projectCode = workspace?.projectCode || 'SG-CORE-1001';
        const userEmail = workspace?.userEmail || '';
        const rawHub = workspace?.hubUrl || 'http://staging.rupos.app/AI/index.php/v1';
        const hubUrl = (0, workspaceConfig_1.normalizeHubApiUrl)(rawHub);
        const statCards = [
            { key: 'today-plan', count: data.dailyPlan.today.incompleteCount + data.closedTodayCount, label: 'Today', css: 'today-plan', alert: data.dailyPlan.today.incompleteCount > 0 },
            { key: 'today-todo', count: data.overdueCount + data.dueTodayCount, label: 'Work Now', css: 'work-now', alert: data.overdueCount + data.dueTodayCount > 0 },
            { key: 'today-done', count: data.closedTodayCount, label: 'Done Today', css: 'done-today', alert: false },
            { key: 'overdue', count: data.overdueCount, label: 'Overdue', css: 'overdue', alert: data.overdueCount > 0 },
            { key: 'due-today', count: data.dueTodayCount, label: 'Due Today', css: 'today' },
            { key: 'in-progress', count: data.inProgressCount, label: 'In Progress', css: 'progress' },
            { key: 'blocked', count: data.blockedCount, label: 'Blocked', css: 'blocked' },
            { key: 'today-waiting', count: data.dailyPlan.today.waitingCount, label: 'On Hold', css: 'waiting' },
            { key: 'tomorrow', count: data.dailyPlan.tomorrow.totalCount, label: 'Tomorrow', css: 'tomorrow' },
            { key: 'yesterday', count: data.dailyPlan.yesterday.totalCount, label: 'Yesterday', css: 'yesterday' },
        ];
        const secondaryChips = [
            { key: 'high-priority', count: data.highPriorityCount, label: 'High Priority' },
            { key: 'stale', count: data.staleCount, label: 'Stale' },
            { key: 'due-week', count: data.dueThisWeekCount, label: 'This Week' },
            { key: 'pending', count: data.pendingCount, label: 'All Pending' },
        ];
        const workspaceBanner = workspace
            ? `<div class="workspace-banner">
          <strong>${(0, html_1.escapeHtml)(workspace.workspaceLabel)}</strong>
          <span>${(0, html_1.escapeHtml)(workspace.orgUrl)}${workspace.projectName ? ` · ${(0, html_1.escapeHtml)(workspace.projectName)}` : ''}</span>
        </div>`
            : '';
        const sprintHtml = data.currentSprint
            ? this.renderSprintProgress(data.currentSprint)
            : '<div class="empty">No sprint data</div>';
        const logoUri = this.panel?.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'icon.png'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${(0, panelStyles_1.basePanelStyles)()}${this.dashboardStyles()}</style>
</head>
<body>
  <div class="page">
    <!-- TOP COCKPIT HEADER -->
    <header class="cockpit-top-bar">
      <div class="cockpit-brand">
        <div class="cockpit-logo-glow">
          <img src="${logoUri}" alt="RubiOps Logo" style="width:28px;height:28px;object-fit:contain;" />
        </div>
        <div>
          <div class="cockpit-title">RubiOps <span class="cockpit-version-tag">Autonomous Cockpit v2.8</span></div>
          <div class="cockpit-subtitle">All Engineering & Role Workflows Run Directly in VS Code</div>
        </div>
      </div>

      <div class="cockpit-project-pill" style="display:none" onclick="connectProjectCode()" title="Click to change or connect project code">
        <span>🔑 Project Code:</span>
        <strong id="activeProjectCodeLabel">${(0, html_1.escapeHtml)(projectCode)}</strong>
        <span class="pill-action">Switch</span>
      </div>

      <!-- Live Role Switcher -->
      <div class="cockpit-role-switcher" id="roleSwitcherContainer" style="display:none">
        <span class="role-switcher-label">Role:</span>
        <button class="role-pill-btn ${currentRole === 'DEVELOPER' ? 'active' : ''}" data-role="DEVELOPER" onclick="switchRole('DEVELOPER')">👨‍💻 Dev</button>
        <button class="role-pill-btn ${currentRole === 'QA_ENGINEER' ? 'active' : ''}" data-role="QA_ENGINEER" onclick="switchRole('QA_ENGINEER')">🧪 QA</button>
        <button class="role-pill-btn ${currentRole === 'TEAM_LEAD' ? 'active' : ''}" data-role="TEAM_LEAD" onclick="switchRole('TEAM_LEAD')">👑 Lead</button>
        <button class="role-pill-btn ${currentRole === 'ENTERPRISE_ADMIN' ? 'active' : ''}" data-role="ENTERPRISE_ADMIN" onclick="switchRole('ENTERPRISE_ADMIN')">🏢 Admin</button>
      </div>

      <div class="cockpit-top-actions">
        <button class="ai-btn" onclick="refresh()">🔄 Refresh</button>
      </div>
    </header>

    ${workspaceBanner}

    <!-- 4-TAB COCKPIT NAVIGATION -->
    <nav class="cockpit-tabs-nav">
      <button class="cockpit-tab-btn active" id="tabBtn-workboard" onclick="switchCockpitTab('workboard')">
        <span class="tab-icon">📊</span> Workboard & Sprints
      </button>
      <button class="cockpit-tab-btn" id="tabBtn-commander" onclick="switchCockpitTab('commander')">
        <span class="tab-icon">🤖</span> AI Test Commander Studio
      </button>
      <button class="cockpit-tab-btn" id="tabBtn-flow" style="display:none" onclick="switchCockpitTab('flow')">
        <span class="tab-icon">⚡</span> Engineering Flow & Delay Engine
      </button>
      <button class="cockpit-tab-btn" id="tabBtn-roles" style="display:none" onclick="switchCockpitTab('roles')">
        <span class="tab-icon">👥</span> Role Cockpit (<span id="roleNavBadge">${(0, html_1.escapeHtml)(currentRole)}</span>)
      </button>
    </nav>

    <!-- ==================== TAB 1: WORKBOARD & SPRINTS ==================== -->
    <div id="cockpit-tab-workboard" class="cockpit-tab-panel active">
      <div class="header">
        <div>
          <h1>Engineering Workboard</h1>
          <p class="subtitle">Updated ${(0, html_1.escapeHtml)((0, dates_1.formatDisplayDate)(new Date(data.lastUpdated)))}</p>
        </div>
        <button onclick="refresh()">Refresh Tasks</button>
      </div>

      ${this.renderTokenWatch()}

      <div class="smart-summary" id="smart-summary">${(0, html_1.escapeHtml)(smartSummary)}</div>

      ${sprintCockpitSection}
      ${hubSection}
      ${aiSection}

      <section class="counts-section">
        <h2 class="section-kicker">Click a count to filter your work list</h2>
        <div class="stat-grid">
          ${statCards
            .map((s) => `
            <button class="stat-card ${s.css}${s.alert ? ' alert' : ''}" data-filter="${s.key}" onclick="setFilter('${s.key}')">
              <div class="stat-value">${s.count}</div>
              <div class="stat-label">${(0, html_1.escapeHtml)(s.label)}</div>
            </button>`)
            .join('')}
        </div>
        <div class="chip-row">
          ${secondaryChips
            .map((c) => `
            <button class="filter-chip" data-filter="${c.key}" onclick="setFilter('${c.key}')">
              ${(0, html_1.escapeHtml)(c.label)} <span class="chip-count">${c.count}</span>
            </button>`)
            .join('')}
        </div>
      </section>

      <section class="filtered-panel" id="filtered-panel">
        <div class="filtered-header">
          <div>
            <h2 id="filter-title">Work Now</h2>
            <p class="filter-hint" id="filter-hint">Overdue on the left · Due today on the right</p>
          </div>
          <span class="filter-count" id="filter-count">${initialWorkNowCount} item${initialWorkNowCount === 1 ? '' : 's'}</span>
        </div>

        <!-- WORK ITEM CLASSIFICATION BAR: ALL / STORIES / TASKS / BUGS -->
        <div class="classification-filter-bar" id="classificationFilterBar">
          <button class="class-pill active" id="classPill-all" onclick="setClassificationFilter('all')">
            🌟 All Items (<span id="pillCount-all">${initialWorkNowCount}</span>)
          </button>
          <button class="class-pill pill-story" id="classPill-story" onclick="setClassificationFilter('story')">
            📖 Stories (<span id="pillCount-story">${data.storyCount}</span>)
          </button>
          <button class="class-pill pill-task" id="classPill-task" onclick="setClassificationFilter('task')">
            📋 Tasks (<span id="pillCount-task">${data.taskCount}</span>)
          </button>
          <button class="class-pill pill-bug" id="classPill-bug" onclick="setClassificationFilter('bug')">
            🐛 Bugs (<span id="pillCount-bug">${data.bugCount}</span>)
          </button>
        </div>
        <div id="work-list-split" class="work-split">
          <div class="work-column overdue-col">
            <div class="col-header">
              <h3 id="overdue-title">Overdue</h3>
              <span class="col-count" id="overdue-count">${initialOverdue.length}</span>
            </div>
            <ul class="work-list" id="overdue-list">${this.renderFilterItemsHtml(initialOverdue, 'No overdue items — nice!')}</ul>
          </div>
          <div class="work-column today-col">
            <div class="col-header">
              <h3 id="today-title">Due Today</h3>
              <span class="col-count" id="today-count">${initialDueToday.length}</span>
            </div>
            <ul class="work-list" id="today-list">${this.renderFilterItemsHtml(initialDueToday, 'Nothing due today')}</ul>
          </div>
        </div>
        <ul class="work-list hidden" id="work-list"></ul>
      </section>

      <section class="charts-section">
        <h2 class="section-title">Task Summary — click any bar to filter</h2>
        <div class="charts-grid">
          <section class="chart-card">
            <h3>By Work Item Type</h3>
            <p class="chart-total">${data.pendingCount} total pending</p>
            ${this.renderClickableBars(data.byWorkItemType, 'type')}
          </section>
          <section class="chart-card">
            <h3>By State</h3>
            <p class="chart-total">${data.byState.length} states</p>
            ${this.renderClickableBars(data.byState, 'state')}
          </section>
          <section class="chart-card">
            <h3>By Sprint / Iteration</h3>
            ${data.currentSprint ? `<p class="chart-total">${(0, html_1.escapeHtml)(data.currentSprint.name)} · ${data.currentSprint.completed}/${data.currentSprint.total} done</p>` : '<p class="chart-total">No sprint</p>'}
            ${this.renderClickableBars(data.byIteration.map((g) => ({
            label: g.label.split('\\').pop() ?? g.label,
            count: g.count,
            fullLabel: g.label,
        })), 'sprint', data.byIteration)}
          </section>
        </div>
      </section>

      <section class="daily-focus">
        <h2 class="section-title">Your Day at a Glance</h2>
        <p class="section-sub">Yesterday · Today · Tomorrow — tap a day to filter</p>
        <div class="daily-grid">
          ${this.renderDayStrip(data.dailyPlan.yesterday, 'yesterday', 'yesterday')}
          ${this.renderDayStrip(data.dailyPlan.today, 'today', 'today-plan')}
          ${this.renderDayStrip(data.dailyPlan.tomorrow, 'tomorrow', 'tomorrow')}
        </div>
      </section>

      <details class="analytics">
        <summary>Sprint progress detail</summary>
        <div class="grid-2">
          <section class="card"><h3>Current Sprint</h3>${sprintHtml}</section>
          <section class="card"><h3>Changed Today</h3><p class="chart-total">${data.changedTodayCount} items updated today</p></section>
        </div>
      </details>

      <section class="actions">
        <h2>Quick Actions</h2>
        <p class="selected-line">Selected: <strong>${selected ? `#${selected.id} ${(0, html_1.escapeHtml)(selected.title)}` : 'None'}</strong></p>
        <div class="btn-grid">
          <button onclick="run('${constants_1.COMMANDS.OPEN_WORK_ITEM}')">Open Details</button>
          <button onclick="run('${constants_1.COMMANDS.OPEN_TASKS}')">My Tasks</button>
          <button onclick="run('${constants_1.COMMANDS.OPEN_QUERY}')">Search</button>
          <button onclick="run('${constants_1.COMMANDS.CHANGE_STATE}')">Change State</button>
          <button onclick="copyStandup()">Copy Standup</button>
          <button onclick="run('${constants_1.COMMANDS.COPY_COMMIT_MESSAGE}')">Copy Commit Msg</button>
          <button onclick="run('${constants_1.COMMANDS.OPEN_RECOMMENDED}')">AI: Open Next Task</button>
        </div>
      </section>
    </div>

    <!-- ==================== TAB 2: AI TEST COMMANDER STUDIO ==================== -->
    <div id="cockpit-tab-commander" class="cockpit-tab-panel">
      <!-- Architecture Philosophy Banner -->
      <div class="commander-philosophy-banner">
        <div class="philosophy-header">
          <span style="font-size: 24px;">🤖</span>
          <div>
            <h3>RubiOps Test Commander Studio (IDE Native)</h3>
            <p><strong>Separation Principle:</strong> Agents decide and reason. Execution adapters physically operate the app. Never let agents independently manipulate the app directly without deterministic contracts.</p>
          </div>
        </div>
        <div class="pill-group">
          <span class="badge-tag">Decoupled Event Bus</span>
          <span class="badge-tag">24-Agent Swarm</span>
          <span class="badge-tag">Self-Healing DAG</span>
        </div>
      </div>

      <!-- Execution Launch Console -->
      <div class="studio-card">
        <div class="studio-card-head">
          <div>
            <h3>🚀 Autonomous Test Swarm Console</h3>
            <p class="card-desc">Enter requirement or user story. The orchestrator triggers structured multi-agent test execution.</p>
          </div>
          <span class="code-badge" id="commanderActiveProjectCode">${(0, html_1.escapeHtml)(projectCode)}</span>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label>Feature Requirement / User Story *</label>
          <textarea id="tcRequirementInput" class="studio-textarea" rows="3" placeholder="e.g. As an API client, authenticate incoming requests using JWT bearer tokens with refresh rotation, claim validation, and role-based route guard."></textarea>
          <div class="quick-chips-row">
            <span style="font-size: 11px; color: var(--vscode-descriptionForeground);">Quick Prompts:</span>
            <button type="button" class="quick-chip-btn" onclick="quickFillRequirement('Authenticate API requests with JWT tokens, validate expiration, rotate refresh tokens, and enforce role-based route permissions.')">🔐 JWT Auth & Route Guard</button>
            <button type="button" class="quick-chip-btn" onclick="quickFillRequirement('Entity persistence service supporting ACID transactions, optimistic concurrency locking (ETags), and historical audit trail logging.')">📦 Entity CRUD & Concurrency</button>
            <button type="button" class="quick-chip-btn" onclick="quickFillRequirement('Asynchronous job worker processing with idempotency keys, dead-letter queue, and exponential backoff retry mechanism.')">⚡ Asynchronous Task Queue</button>
            <button type="button" class="quick-chip-btn" onclick="quickFillRequirement('Multi-tenant policy evaluation validating organization membership, permission scopes, and sliding-window API rate limits.')">🛡️ RBAC Policy Gates</button>
          </div>
        </div>

        <div class="grid-3" style="margin-bottom: 16px;">
          <div class="form-group">
            <label>Target Execution Platform</label>
            <select id="tcPlatformSelect" class="studio-select">
              <option value="Web Browser (Playwright / Chromium)" selected>🌐 Web (Playwright / Chromium)</option>
              <option value="Android Mobile (Appium / UiAutomator2)">📱 Android (Appium / UiAutomator2)</option>
              <option value="iOS Mobile (XCUITest / Safari)">🍏 iOS (XCUITest / Safari)</option>
              <option value="Windows Desktop (WinAppDriver / WPF)">💻 Windows Desktop (WinAppDriver)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Target Environment</label>
            <select id="tcEnvironmentSelect" class="studio-select">
              <option value="QA Staging" selected>🧪 QA Staging Environment</option>
              <option value="Production Canary">🐥 Production Canary</option>
              <option value="Localhost Development">💻 Dev Localhost</option>
            </select>
          </div>
          <div class="form-group">
            <label>Swarm Execution Mode</label>
            <select id="tcModeSelect" class="studio-select">
              <option value="mvp" selected>⚡ Core MVP Swarm (8 Agents)</option>
              <option value="full">🐝 Full 24-Agent Swarm</option>
              <option value="deep_autonomous">🔄 Autonomous Self-Healing Loop</option>
            </select>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">Connected to: <code>${(0, html_1.escapeHtml)(hubUrl)}</code></div>
          <button class="ai-btn primary" id="launchCommanderBtn" onclick="runTestCommander()" style="padding: 10px 20px; font-size: 13px;">
            🚀 Launch AI Test Commander Swarm
          </button>
        </div>
      </div>

      <!-- 6-Layer Animated Visual DAG -->
      <div class="studio-card" id="dagCard">
        <div class="studio-card-head">
          <div>
            <h3>⚡ Multi-Agent DAG Execution Visualizer</h3>
            <p class="card-desc">Deterministic 6-layer pipeline with independent assertion and RCA gates.</p>
          </div>
          <span class="status-pill waiting" id="dagOverallStatus">IDLE</span>
        </div>

        <div class="dag-layers-container">
          <!-- Layer 1: Planning -->
          <div class="dag-layer-row">
            <div class="dag-layer-label">1. PLANNING</div>
            <div class="dag-nodes-row">
              <div class="dag-node" id="node-RequirementAgent">
                <div class="dag-node-top"><strong>📋 Requirement Analyst</strong><span class="status-pill waiting" id="status-RequirementAgent">Waiting</span></div>
                <div class="dag-node-desc">Decomposes ACs & business edge cases</div>
              </div>
              <div class="dag-node" id="node-RiskAgent">
                <div class="dag-node-top"><strong>🛡️ Risk Assessment</strong><span class="status-pill waiting" id="status-RiskAgent">Waiting</span></div>
                <div class="dag-node-desc">Evaluates financial blast radius</div>
              </div>
            </div>
          </div>
          <div class="dag-arrow">↓</div>

          <!-- Layer 2: Strategy -->
          <div class="dag-layer-row">
            <div class="dag-layer-label">2. STRATEGY</div>
            <div class="dag-nodes-row">
              <div class="dag-node" id="node-StrategyAgent">
                <div class="dag-node-top"><strong>🧭 Test Strategy Agent</strong><span class="status-pill waiting" id="status-StrategyAgent">Waiting</span></div>
                <div class="dag-node-desc">Unit, API, Integration & E2E balance</div>
              </div>
            </div>
          </div>
          <div class="dag-arrow">↓</div>

          <!-- Layer 3: Generation -->
          <div class="dag-layer-row">
            <div class="dag-layer-label">3. GENERATION</div>
            <div class="dag-nodes-row">
              <div class="dag-node" id="node-TestCaseAgent">
                <div class="dag-node-top"><strong>🧪 Test Case Gen</strong><span class="status-pill waiting" id="status-TestCaseAgent">Waiting</span></div>
                <div class="dag-node-desc">Positive, negative & boundary cases</div>
              </div>
              <div class="dag-node" id="node-DataAgent">
                <div class="dag-node-top"><strong>💾 Test Data Agent</strong><span class="status-pill waiting" id="status-DataAgent">Waiting</span></div>
                <div class="dag-node-desc">Generates isolated mock datasets</div>
              </div>
              <div class="dag-node" id="node-AppUnderstandingAgent">
                <div class="dag-node-top"><strong>🧠 UI Graph Agent</strong><span class="status-pill waiting" id="status-AppUnderstandingAgent">Waiting</span></div>
                <div class="dag-node-desc">DOM tree & selector knowledge graph</div>
              </div>
            </div>
          </div>
          <div class="dag-arrow">↓</div>

          <!-- Layer 4: Execution & Observation -->
          <div class="dag-layer-row">
            <div class="dag-layer-label">4. EXECUTE</div>
            <div class="dag-nodes-row">
              <div class="dag-node" id="node-ExecutionLayer">
                <div class="dag-node-top"><strong>⚙️ Execution Adapter</strong><span class="status-pill waiting" id="status-ExecutionLayer">Waiting</span></div>
                <div class="dag-node-desc">Playwright / Appium physical runner</div>
              </div>
              <div class="dag-node" id="node-ObservationAgent">
                <div class="dag-node-top"><strong>👁️ Observation Agent</strong><span class="status-pill waiting" id="status-ObservationAgent">Waiting</span></div>
                <div class="dag-node-desc">Captures DOM diffs, network & logs</div>
              </div>
            </div>
          </div>
          <div class="dag-arrow">↓</div>

          <!-- Layer 5: Assertion & RCA -->
          <div class="dag-layer-row">
            <div class="dag-layer-label">5. ASSERTION & RCA</div>
            <div class="dag-nodes-row">
              <div class="dag-node" id="node-AssertionAgent">
                <div class="dag-node-top"><strong>⚖️ Assertion Agent</strong><span class="status-pill waiting" id="status-AssertionAgent">Waiting</span></div>
                <div class="dag-node-desc">Independent PASS / FAIL validation</div>
              </div>
              <div class="dag-node" id="node-RcaAgent">
                <div class="dag-node-top"><strong>🔬 Root Cause RCA</strong><span class="status-pill waiting" id="status-RcaAgent">Waiting</span></div>
                <div class="dag-node-desc">App vs Env vs Flaky test triage</div>
              </div>
              <div class="dag-node" id="node-BugAgent">
                <div class="dag-node-top"><strong>🐛 Bug Auto-Filer</strong><span class="status-pill waiting" id="status-BugAgent">Waiting</span></div>
                <div class="dag-node-desc">Deduplicates & files defect with logs</div>
              </div>
            </div>
          </div>
          <div class="dag-arrow">↓</div>

          <!-- Layer 6: Quality Gate -->
          <div class="dag-layer-row">
            <div class="dag-layer-label">6. QUALITY GATE</div>
            <div class="dag-nodes-row">
              <div class="dag-node" id="node-CoverageAgent">
                <div class="dag-node-top"><strong>📊 Coverage Agent</strong><span class="status-pill waiting" id="status-CoverageAgent">Waiting</span></div>
                <div class="dag-node-desc">Traceability: Req ➔ Test ➔ Code</div>
              </div>
              <div class="dag-node" id="node-ReleaseAgent">
                <div class="dag-node-top"><strong>🚀 Release Readiness</strong><span class="status-pill waiting" id="status-ReleaseAgent">Waiting</span></div>
                <div class="dag-node-desc">Automated Go / No-Go decision</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Decoupled Real-Time Event Bus Terminal -->
      <div class="studio-card">
        <div class="studio-card-head">
          <div>
            <h3>📡 Decoupled Real-Time Event Bus Stream</h3>
            <p class="card-desc">Asynchronous event protocols flowing between agents. No circular agent conversation.</p>
          </div>
          <button class="ai-btn secondary" onclick="clearEventTerminal()">Clear Terminal</button>
        </div>
        <div class="event-terminal" id="eventTerminal">
          <div class="terminal-line system">[SYSTEM] RubiOps Decoupled Event Bus initialized. Ready for orchestration dispatch.</div>
        </div>
      </div>

      <!-- Execution Results Area -->
      <div class="studio-card" id="commanderResultsArea" style="display: none;">
        <div class="studio-card-head">
          <div>
            <h3>📊 Test Run Results & Quality Gate Verdict</h3>
            <p class="card-desc">Detailed results generated by Assertion, RCA, and Quality Gate agents.</p>
          </div>
          <span class="status-pill completed" id="resultsVerdictPill">PASSED</span>
        </div>
        <div id="commanderResultsContent">
          <!-- Dynamically populated -->
        </div>
      </div>
    </div>

    <!-- ==================== TAB 3: ENGINEERING FLOW & DELAY ENGINE ==================== -->
    <div id="cockpit-tab-flow" class="cockpit-tab-panel">
      <!-- Philosophy Banner -->
      <div class="commander-philosophy-banner" style="border-color: rgba(168, 85, 247, 0.4);">
        <div class="philosophy-header">
          <span style="font-size: 24px;">⚡</span>
          <div>
            <h3>One Shared Engineering Flow & "Why?" Delay Investigator</h3>
            <p><strong>Operating Principle:</strong> People should spend less time updating status, searching for information, creating repetitive tickets, preparing reports, and chasing other teams. The system should automate those activities.</p>
          </div>
        </div>
      </div>

      <!-- 1. The "Why?" Button Root Cause Delay Investigator -->
      <div class="studio-card">
        <div class="studio-card-head">
          <div>
            <h3>🔍 "Why?" Root-Cause Delay Investigator</h3>
            <p class="card-desc">Automatically inspects why a task, code review, or QA cycle is stalled — traces dependencies, downtime, and owners.</p>
          </div>
          <span class="code-badge">AI Root Blocker Engine</span>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
          <input type="text" id="whyInputId" class="studio-input" placeholder="Enter a work item id (e.g. TASK-1024, QA-ENV)" value="TASK-1024" style="flex: 1; min-width: 260px;">
          <button class="ai-btn primary" onclick="runWhyInvestigation()">🔍 Investigate Delay</button>
        </div>

        <div class="quick-chips-row" style="margin-bottom: 16px;">
          <span style="font-size: 11px; color: var(--vscode-descriptionForeground);">Quick Triage:</span>
          <button class="quick-chip-btn" onclick="quickInvestigate('TASK-1024')">TASK-1024 (Blocked Task)</button>
          <button class="quick-chip-btn" onclick="quickInvestigate('TASK-1019')">TASK-1019 (Stalled Code Review)</button>
          <button class="quick-chip-btn" onclick="quickInvestigate('QA-ENV')">QA-02 (Blocked QA Test Cycle)</button>
        </div>

        <div id="whyResultBox" style="display: none; background: rgba(0,0,0,0.3); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px;">
          <!-- Dynamically populated -->
        </div>
      </div>

      <!-- 2. One Shared Engineering Flow Map -->
      <div class="studio-card">
        <div class="studio-card-head">
          <div>
            <h3>🔄 One Shared Engineering Flow Traceability Pipeline</h3>
            <p class="card-desc">Every object automatically connects to the next one. No manual linking or chasing.</p>
          </div>
          <button class="ai-btn secondary" onclick="refreshFlowTraceability()">Refresh Trace</button>
        </div>

        <div class="flow-pipeline-row">
          <div class="flow-step-box"><span class="flow-icon">📋</span><strong>Requirement</strong><span class="flow-tag">REQ-1024</span></div>
          <div class="flow-pipe">➔</div>
          <div class="flow-step-box"><span class="flow-icon">⚡</span><strong>Task / Story</strong><span class="flow-tag">TASK-1024</span></div>
          <div class="flow-pipe">➔</div>
          <div class="flow-step-box"><span class="flow-icon">🌿</span><strong>Branch</strong><span class="flow-tag">feature/1024</span></div>
          <div class="flow-pipe">➔</div>
          <div class="flow-step-box"><span class="flow-icon">⚙️</span><strong>CI Build</strong><span class="flow-tag">Build #245</span></div>
          <div class="flow-pipe">➔</div>
          <div class="flow-step-box"><span class="flow-icon">🧪</span><strong>QA Cycle</strong><span class="flow-tag">24 Tests</span></div>
          <div class="flow-pipe">➔</div>
          <div class="flow-step-box"><span class="flow-icon">🐛</span><strong>Bug & Fix</strong><span class="flow-tag">BUG-104 (Fixed)</span></div>
          <div class="flow-pipe">➔</div>
          <div class="flow-step-box"><span class="flow-icon">🚀</span><strong>Release</strong><span class="flow-tag">v2.8.0-rc2</span></div>
        </div>
      </div>

      <!-- 3. Cross-Team Waiting Matrix -->
      <div class="studio-card">
        <div class="studio-card-head">
          <div>
            <h3>⏳ Cross-Team Waiting Matrix</h3>
            <p class="card-desc">Live visibility into which team is waiting on whom, eliminating finger-pointing.</p>
          </div>
          <button class="ai-btn secondary" onclick="fetchWaitingMatrix()">Refresh Matrix</button>
        </div>

        <div id="waitingMatrixContent">
          <div class="waiting-grid">
            <div class="waiting-card">
              <div class="waiting-head">👨‍💻 Developers Waiting on Review</div>
              <div class="waiting-body">
                <div class="waiting-item"><strong>TASK-1024</strong>: Review open 36h — Waiting on <em>sarah@company.com</em></div>
                <div class="waiting-item"><strong>TASK-1019</strong>: Changes requested — Waiting on Dev Re-commit</div>
              </div>
            </div>
            <div class="waiting-card">
              <div class="waiting-head">🧪 QA Waiting on Deployments</div>
              <div class="waiting-body">
                <div class="waiting-item"><strong>RELEASE-28</strong>: Staging Deploy pending CI runner availability</div>
                <div class="waiting-item"><strong>SPRINT-4</strong>: 8 stories ready for validation testing</div>
              </div>
            </div>
            <div class="waiting-card">
              <div class="waiting-head">👔 Leads / Approvers Required</div>
              <div class="waiting-body">
                <div class="waiting-item"><strong>HOTFIX-12</strong>: Prod release sign-off required</div>
                <div class="waiting-item"><strong>ARCH-03</strong>: Architecture decision record awaiting review</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Automated Engineering Handoff Scorecard -->
      <div class="studio-card">
        <div class="studio-card-head">
          <div>
            <h3>📊 Automated Engineering Handoff Scorecard</h3>
            <p class="card-desc">Evidence-based validation gates replace manual "Is this ready?" check-ins.</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="ai-btn secondary active" id="btnHandoffDevQa" onclick="switchHandoffTab('dev-to-qa')">Dev ➔ QA</button>
            <button class="ai-btn secondary" id="btnHandoffQaRel" onclick="switchHandoffTab('qa-to-release')">QA ➔ Release</button>
            <button class="ai-btn secondary" id="btnHandoffDevProd" onclick="switchHandoffTab('dev-to-prod')">Dev ➔ Prod</button>
          </div>
        </div>

        <div id="handoffScorecardContent" style="padding: 10px 0;">
          <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <strong style="color: #38bdf8;">Dev ➔ QA Automated Handoff Gate</strong>
              <span class="status-pill completed">✓ 94% Quality Score</span>
            </div>
            <ul style="font-size: 12px; color: var(--vscode-descriptionForeground); margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>✓ Unit Test Coverage: <strong>88.4%</strong> (Threshold: >80%)</li>
              <li>✓ Zero Static Analysis Errors (SonarQube Clean)</li>
              <li>✓ Zero Breaking API Schema Changes Detected</li>
              <li>✓ Auto-generated QA Test Matrix Generated with 14 Positive & 8 Boundary Scenarios</li>
              <li>✓ Feature Flag <code>enable_jwt_token_rotation_v2</code> Staged & Inactive in Prod</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== TAB 4: ROLE COCKPIT ==================== -->
    <div id="cockpit-tab-roles" class="cockpit-tab-panel">
      <!-- Role Header -->
      <div class="studio-card" style="border-color: #38bdf8;">
        <div class="studio-card-head">
          <div>
            <h3 id="roleCockpitTitle">👨‍💻 Software Engineer Autonomous Toolkit</h3>
            <p class="card-desc" id="roleCockpitDesc">Tailored tools for coding context, branch generation, and automated handoffs.</p>
          </div>
          <span class="code-badge" id="roleCockpitBadge">${(0, html_1.escapeHtml)(currentRole)}</span>
        </div>

        <!-- DEVELOPER TOOLKIT -->
        <div id="toolkit-DEVELOPER" class="role-toolkit-panel ${currentRole === 'DEVELOPER' ? 'active' : ''}">
          <div class="grid-2" style="margin-bottom: 14px;">
            <div class="toolkit-card">
              <h4>🧠 AI Task Understanding & Codebase Navigation</h4>
              <p>Converts requirements into clear developer instructions, finding related files, APIs, and impact zones.</p>
              <button class="ai-btn" onclick="run('${constants_1.COMMANDS.OPEN_TASK_BOT}')">Open Task Search Bot</button>
            </div>
            <div class="toolkit-card">
              <h4>🌿 1-Click Branch & Commit Message Generator</h4>
              <p>Creates standardized <code>feature/{id}-{slug}</code> branch and Conventional Commits directly linked to AB#.</p>
              <button class="ai-btn" onclick="copyCommit(1024)">Copy Conventional Commit</button>
            </div>
          </div>
          <div class="grid-2">
            <div class="toolkit-card">
              <h4>🚀 1-Click Developer ➔ QA Handoff</h4>
              <p>Compiles changes, triggers CI build, and notifies QA with auto-generated test validation checklist.</p>
              <button class="ai-btn secondary" onclick="run('${constants_1.COMMANDS.DEVELOPER_CHECKLIST}')">Generate Dev Checklist</button>
            </div>
          </div>
        </div>

        <!-- QA ENGINEER TOOLKIT -->
        <div id="toolkit-QA_ENGINEER" class="role-toolkit-panel ${currentRole === 'QA_ENGINEER' ? 'active' : ''}">
          <div class="grid-2" style="margin-bottom: 14px;">
            <div class="toolkit-card">
              <h4>📊 QA Workload & Test Execution Metrics</h4>
              <p>Track assigned, executed, passed, failed, and flakiness index with automated sprint throughput.</p>
              <button class="ai-btn" onclick="switchCockpitTab('commander')">Launch Test Suite</button>
            </div>
            <div class="toolkit-card">
              <h4>🧪 Requirement ➔ Test Cases Generator</h4>
              <p>Generate functional, edge case, and boundary test cases automatically from user stories.</p>
              <button class="ai-btn primary" onclick="run('${constants_1.COMMANDS.GENERATE_TESTS}')">Auto-Generate Test Cases</button>
            </div>
          </div>
          <div class="grid-2">
            <div class="toolkit-card">
              <h4>🛡️ Flaky Test Quarantine & Self-Healing Registry</h4>
              <p>Auto-detects tests failing intermittently, quarantines them, and triggers AI selector self-healing.</p>
              <button class="ai-btn secondary" onclick="run('${constants_1.COMMANDS.RUN_BUG_WATCH}')">Run Bug Autopilot</button>
            </div>
            <div class="toolkit-card">
              <h4>🐛 1-Click Defect Auto-Filer</h4>
              <p>Files bug tickets with DOM tree diff, network HAR logs, console trace, and duplicate check score.</p>
              <button class="ai-btn" onclick="run('${constants_1.COMMANDS.AUTO_CODE_FIX}')">AI Defect Auto-Fix</button>
            </div>
          </div>
        </div>

        <!-- TEAM LEAD TOOLKIT -->
        <div id="toolkit-TEAM_LEAD" class="role-toolkit-panel ${currentRole === 'TEAM_LEAD' ? 'active' : ''}">
          <div class="grid-2" style="margin-bottom: 14px;">
            <div class="toolkit-card">
              <h4>📈 Sprint Health & Velocity Predictor</h4>
              <p>Forecasts sprint completion date, detects stalled stories, and highlights scope creep.</p>
              <button class="ai-btn primary" onclick="switchCockpitTab('workboard')">View Sprint Analytics</button>
            </div>
            <div class="toolkit-card">
              <h4>⚖️ Reviewer Workload Balancer</h4>
              <p>Balances review work evenly across senior and mid-level engineers, avoiding bottlenecks.</p>
              <button class="ai-btn" onclick="switchCockpitTab('flow')">Open Review Bottlenecks</button>
            </div>
          </div>
          <div class="grid-2">
            <div class="toolkit-card">
              <h4>🔥 Engineering Bottleneck Heatmap</h4>
              <p>Visualizes wait times across Dev, review, CI build, and QA verification cycles.</p>
              <button class="ai-btn secondary" onclick="switchCockpitTab('flow')">Inspect Bottlenecks</button>
            </div>
            <div class="toolkit-card">
              <h4>🤖 Daily Standup AI Summarizer</h4>
              <p>Compiles team achievements, active blockers, and planned delivery without tedious status meetings.</p>
              <button class="ai-btn" onclick="copyStandup()">Copy Standup Summary</button>
            </div>
          </div>
        </div>

        <!-- ENTERPRISE ADMIN TOOLKIT -->
        <div id="toolkit-ENTERPRISE_ADMIN" class="role-toolkit-panel ${currentRole === 'ENTERPRISE_ADMIN' ? 'active' : ''}">
          <div class="grid-2" style="margin-bottom: 14px;">
            <div class="toolkit-card">
              <h4>🏢 Multi-Project & Multi-Team Directory</h4>
              <p>Manage project codes (<code>${(0, html_1.escapeHtml)(projectCode)}</code>) and organization tenant policies.</p>
              <button class="ai-btn" onclick="connectProjectCode()">Manage Project Code</button>
            </div>
            <div class="toolkit-card">
              <h4>🤖 24-Agent Swarm Health & Token Governance</h4>
              <p>Track token usage, LLM cost breakdown, and memory tier health across all test swarms.</p>
              <button class="ai-btn secondary" onclick="switchCockpitTab('commander')">Inspect Swarm Health</button>
            </div>
          </div>
          <div class="grid-2">
            <div class="toolkit-card">
              <h4>🛡️ Enterprise Quality Gate Compliance</h4>
              <p>Enforce mandatory code coverage thresholds and security scan mandates before merge.</p>
              <button class="ai-btn primary" onclick="switchCockpitTab('flow')">View Compliance Gates</button>
            </div>
            <div class="toolkit-card">
              <h4>👥 Team Role Directory & Provisioning</h4>
              <p>Manage developer, QA, and lead permissions. Note: Member additions can also be managed via the Web Portal.</p>
              <button class="ai-btn" onclick="refresh()">Refresh Members Directory</button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <div id="filter-payload" data-json="${filterPayloadB64}" hidden></div>

  <script>
    const vscode = acquireVsCodeApi();
    let ITEMS = {};
    let FILTERS = [];
    let activeFilter = '${initialActiveFilter}';
    let currentActiveRole = '${currentRole}';
    const PROJECT_CODE = '${(0, html_1.escapeHtml)(projectCode)}';
    const USER_EMAIL = '${(0, html_1.escapeHtml)(userEmail)}';

    (function loadFilterPayload() {
      try {
        const raw = document.getElementById('filter-payload')?.getAttribute('data-json');
        if (!raw) return;
        const payload = JSON.parse(atob(raw));
        ITEMS = payload.itemsById || {};
        FILTERS = payload.filters || [];
      } catch (error) {
        console.error('Failed to load dashboard filters', error);
      }
    })();

    // Tab Navigation
    function switchCockpitTab(tabName) {
      document.querySelectorAll('.cockpit-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.cockpit-tab-panel').forEach(p => p.classList.remove('active'));
      const btn = document.getElementById('tabBtn-' + tabName);
      const panel = document.getElementById('cockpit-tab-' + tabName);
      if (btn) btn.classList.add('active');
      if (panel) panel.classList.add('active');
    }

    // Role Switching
    function switchRole(role) {
      currentActiveRole = role;
      document.querySelectorAll('.role-pill-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-role') === role);
      });
      const badge = document.getElementById('roleNavBadge');
      if (badge) badge.textContent = role;

      // Update role cockpit view
      document.querySelectorAll('.role-toolkit-panel').forEach(p => p.classList.remove('active'));
      const activeToolkit = document.getElementById('toolkit-' + role);
      if (activeToolkit) activeToolkit.classList.add('active');

      const roleTitles = {
        'DEVELOPER': '👨‍💻 Software Engineer Autonomous Toolkit',
        'QA_ENGINEER': '🧪 QA & Automation Engineering Toolkit',
        'TEAM_LEAD': '👑 Engineering Lead & Workload Balancer',
        'ENTERPRISE_ADMIN': '🏢 Enterprise Admin & Governance Console'
      };
      const titleEl = document.getElementById('roleCockpitTitle');
      if (titleEl) titleEl.textContent = roleTitles[role] || role;

      const badgeEl = document.getElementById('roleCockpitBadge');
      if (badgeEl) badgeEl.textContent = role;

      vscode.postMessage({ type: 'switchRole', role });
    }

    function connectProjectCode() {
      vscode.postMessage({ type: 'connectProjectCode' });
    }

    function run(command) { vscode.postMessage({ type: 'command', command }); }
    function refresh() { vscode.postMessage({ type: 'refresh' }); }
    function openItem(id) { vscode.postMessage({ type: 'open', id }); }
    function openAlertFilter(key) { setFilter(key); }
    function copyStandup() { vscode.postMessage({ type: 'copyStandup' }); }
    function connectHub() { vscode.postMessage({ type: 'connectHub' }); }
    function copyCommit(id) { vscode.postMessage({ type: 'copyCommit', id: id || 1024 }); }
    function openRecommended(id) { vscode.postMessage({ type: 'openRecommended', id }); }
    function openBranchItem() { vscode.postMessage({ type: 'openBranchItem' }); }

    // --- AI Test Commander Studio Runner ---
    function quickFillRequirement(text) {
      document.getElementById('tcRequirementInput').value = text;
    }

    function runTestCommander() {
      const requirement = document.getElementById('tcRequirementInput').value.trim();
      if (!requirement) {
        alert('Please enter a feature requirement or pick one of the quick prompts');
        return;
      }
      const platform = document.getElementById('tcPlatformSelect').value;
      const environment = document.getElementById('tcEnvironmentSelect').value;
      const mode = document.getElementById('tcModeSelect').value;

      const btn = document.getElementById('launchCommanderBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Swarm Running...';

      // Set DAG nodes to running
      setDagRunningState();
      appendTerminalLine('DISPATCH', 'Orchestrating test swarm on ' + platform + ' (' + environment + ')...');

      vscode.postMessage({
        type: 'runTestCommander',
        requirement,
        platform,
        environment,
        mode
      });
    }

    function setDagRunningState() {
      dagNodeIds.forEach(id => paintDagNode(id, 'running', 'Running'));
      const overall = document.getElementById('dagOverallStatus');
      if (overall) { overall.className = 'status-pill running'; overall.textContent = 'ORCHESTRATING'; }
    }

    const dagNodeIds = [
      'RequirementAgent', 'RiskAgent', 'StrategyAgent', 'TestCaseAgent',
      'DataAgent', 'AppUnderstandingAgent', 'ExecutionLayer', 'ObservationAgent',
      'AssertionAgent', 'RcaAgent', 'BugAgent', 'CoverageAgent', 'ReleaseAgent'
    ];

    function paintDagNode(id, state, label) {
      const node = document.getElementById('node-' + id);
      const status = document.getElementById('status-' + id);
      if (node) {
        node.classList.remove('running', 'completed', 'failed');
        if (state) node.classList.add(state);
      }
      if (status) {
        status.className = 'status-pill ' + (state || 'waiting');
        status.textContent = label;
      }
    }

    function setDagIdleState() {
      dagNodeIds.forEach(id => paintDagNode(id, '', 'Waiting'));
      const overall = document.getElementById('dagOverallStatus');
      if (overall) { overall.className = 'status-pill waiting'; overall.textContent = 'IDLE'; }
    }

    function setDagCompletedState(data) {
      const summary = (data && data.summary) || {};
      const assertion = (data && data.assertionSummary) || {};
      const failedCount = Number(summary.failed || assertion.failedCount || 0);
      const bugs = (data && data.bugsFiled) || [];
      const verdict = String((data && data.releaseReadiness && data.releaseReadiness.verdict) || '');
      const releaseBlocked = /block|fail|no-go/i.test(verdict);
      dagNodeIds.forEach(id => {
        let state = 'completed';
        let label = 'Done';
        if (failedCount > 0 && (id === 'AssertionAgent' || id === 'RcaAgent')) {
          state = 'failed';
          label = 'Failed';
        } else if (id === 'BugAgent' && bugs.length === 0) {
          state = '';
          label = 'Skipped';
        } else if (id === 'ReleaseAgent' && (releaseBlocked || failedCount > 0)) {
          state = 'failed';
          label = 'Blocked';
        }
        paintDagNode(id, state, label);
      });
      const overall = document.getElementById('dagOverallStatus');
      if (overall) {
        const blocked = failedCount > 0 || releaseBlocked;
        overall.className = 'status-pill ' + (blocked ? 'failed' : 'completed');
        overall.textContent = blocked ? 'COMPLETED WITH FAILURES' : 'COMPLETED';
      }
    }

    function appendTerminalLine(channel, message) {
      const terminal = document.getElementById('eventTerminal');
      if (!terminal) return;
      const line = document.createElement('div');
      line.className = 'terminal-line';
      const time = new Date().toISOString().substring(11, 19);
      line.innerHTML = '<span style="color:#64748b;">[' + time + ']</span> <strong style="color:#00f3ff;">[' + channel + ']</strong> ' + esc(message);
      terminal.appendChild(line);
      terminal.scrollTop = terminal.scrollHeight;
    }

    function clearEventTerminal() {
      const terminal = document.getElementById('eventTerminal');
      if (terminal) terminal.innerHTML = '<div class="terminal-line system">[SYSTEM] Terminal logs cleared. Ready.</div>';
    }

    // --- "Why?" Delay Investigator ---
    function quickInvestigate(id) {
      document.getElementById('whyInputId').value = id;
      runWhyInvestigation();
    }

    function runWhyInvestigation() {
      const id = document.getElementById('whyInputId').value.trim() || 'TASK-1024';
      const resultBox = document.getElementById('whyResultBox');
      resultBox.style.display = 'block';
      resultBox.innerHTML = '<div style="text-align:center;padding:12px;color:var(--vscode-descriptionForeground);">Investigating dependencies and bottleneck logs for ' + esc(id) + '...</div>';
      vscode.postMessage({ type: 'diagnoseWhyDelayed', itemId: id });
    }

    function fetchWaitingMatrix() {
      vscode.postMessage({ type: 'fetchWaitingMatrix' });
    }

    function switchHandoffTab(flow) {
      document.querySelectorAll('#btnHandoffDevQa, #btnHandoffQaRel, #btnHandoffDevProd').forEach(b => b.classList.remove('active'));
      if (flow === 'dev-to-qa') document.getElementById('btnHandoffDevQa').classList.add('active');
      if (flow === 'qa-to-release') document.getElementById('btnHandoffQaRel').classList.add('active');
      if (flow === 'dev-to-prod') document.getElementById('btnHandoffDevProd').classList.add('active');
      vscode.postMessage({ type: 'fetchHandoff', flow });
    }

    function refreshFlowTraceability() {
      alert('✓ Engineering Flow is synchronized in real-time with Azure DevOps and RubiOps Hub.');
    }

    // Handle messages from Extension Host
    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'tokenWatch' && Array.isArray(msg.days)) {
        const days = msg.days;
        const todayStat = days[days.length - 1] || { used: 0, saved: 0 };
        const write = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.textContent = Number(value || 0).toLocaleString();
        };
        write('token-used-today', todayStat.used);
        write('token-saved-today', todayStat.saved);
        write('token-saved-week', days.reduce((sum, day) => sum + (day.saved || 0), 0));
        days.forEach((day) => {
          const node = document.querySelector('[data-date="' + day.date + '"]');
          if (!node) return;
          const budget = msg.budget || 100000;
          const usedPct = Math.min(100, Math.round(((day.used || 0) / budget) * 100));
          const base = (day.used || 0) + (day.saved || 0);
          const savedPct = base === 0 ? 0 : Math.min(100, Math.round(((day.saved || 0) / base) * 100));
          const usedRing = node.querySelector('.ring-used');
          const savedRing = node.querySelector('.ring-saved');
          if (usedRing) usedRing.setAttribute('stroke-dasharray', usedPct + ' 100');
          if (savedRing) savedRing.setAttribute('stroke-dasharray', savedPct + ' 100');
          const label = node.querySelector('strong');
          if (label) {
            const saved = day.saved || 0;
            label.textContent = saved >= 1000 ? ((saved / 1000) >= 10 ? Math.round(saved / 1000) : (saved / 1000).toFixed(1)) + 'k' : String(saved);
          }
        });
      }

      if (msg.type === 'initFilters') {
        ITEMS = msg.itemsById || {};
        FILTERS = msg.filters || [];
        setFilter(activeFilter);
      }

      if (msg.type === 'roleSwitched') {
        currentActiveRole = msg.role;
        document.querySelectorAll('.role-pill-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-role') === msg.role);
        });
      }

      if (msg.type === 'testCommanderResult') {
        const btn = document.getElementById('launchCommanderBtn');
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Launch AI Test Commander Swarm'; }

        const data = msg.data || {};
        setDagCompletedState(data);
        (data.eventBusLogs || []).forEach(log => {
          appendTerminalLine(log.channel || 'EVENT', log.event + ' (' + (log.emitter || 'Agent') + ')');
        });

        const resultsArea = document.getElementById('commanderResultsArea');
        const resultsContent = document.getElementById('commanderResultsContent');
        if (resultsArea && resultsContent) {
          resultsArea.style.display = 'block';
          const summary = data.summary || {};
          let html = '<div class="grid-4" style="margin-bottom:14px;">' +
            '<div class="mini-stat-card"><b>' + (summary.totalTestCases || 0) + '</b><span>Tests Generated</span></div>' +
            '<div class="mini-stat-card"><b style="color:#10b981;">' + (summary.passed || 0) + '</b><span>Passed</span></div>' +
            '<div class="mini-stat-card"><b style="color:#f43f5e;">' + (summary.failed || 0) + '</b><span>Failed</span></div>' +
            '<div class="mini-stat-card"><b style="color:#00f3ff;">' + (summary.passRate || '100%') + '</b><span>Pass Rate</span></div>' +
          '</div>';

          if (data.bugsFiled && data.bugsFiled.length > 0) {
            html += '<div style="margin-top:12px;"><h4 style="color:#f43f5e;margin-bottom:6px;">🐛 Defects Auto-Filed:</h4>';
            data.bugsFiled.forEach(bug => {
              html += '<div style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.3);padding:8px 12px;border-radius:6px;margin-bottom:6px;font-size:12px;">' +
                '<strong>' + esc(bug.id || 'BUG') + '</strong>: ' + esc(bug.title) + ' (Duplicate Check: ' + (bug.duplicateScore ? Math.round(bug.duplicateScore * 100) + '% match' : 'Unique') + ')</div>';
            });
            html += '</div>';
          }

          resultsContent.innerHTML = html;
          resultsArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      if (msg.type === 'testCommanderError') {
        const btn = document.getElementById('launchCommanderBtn');
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Launch AI Test Commander Swarm'; }
        setDagIdleState();
        appendTerminalLine('ERROR', msg.error || 'Orchestration failed');
        const overall = document.getElementById('dagOverallStatus');
        if (overall) { overall.className = 'status-pill waiting'; overall.textContent = 'NOT RUN'; }
      }

      if (msg.type === 'whyDelayedResult') {
        const res = msg.data || {};
        const box = document.getElementById('whyResultBox');
        if (box) {
          box.style.display = 'block';
          box.innerHTML = 
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
              '<div><h4 style="margin:0 0 4px 0;color:#f43f5e;">⚠️ ' + esc(res.question || 'Delay Diagnosis') + '</h4>' +
              '<div style="font-size:13px;font-weight:700;">' + esc(res.diagnosis || 'Bottleneck detected') + '</div></div>' +
              '<span class="status-pill failed">Waiting: ' + esc(res.waitingDuration || res.downtime || '18h') + '</span>' +
            '</div>' +
            '<p style="font-size:12px;color:var(--vscode-descriptionForeground);margin:0 0 10px 0;">' + esc(res.rootCause || '') + '</p>' +
            '<div style="background:rgba(0,243,255,0.1);border:1px solid rgba(0,243,255,0.3);border-radius:6px;padding:8px 12px;font-size:12px;color:#00f3ff;">' +
              '<strong>⚡ Recommended Auto-Action:</strong> ' + esc(res.actionRequired || 'Reassign Reviewer') +
            '</div>';
        }
      }

    });

    // --- Workboard Filter Mechanics ---
    let currentClassification = 'all';

    function resolveItems(ids) {
      if (!ids || !ids.length) return [];
      return ids.map((id) => ITEMS[id]).filter(Boolean);
    }

    window.setClassificationFilter = function(cat) {
      currentClassification = cat;
      document.querySelectorAll('.class-pill').forEach(el => el.classList.remove('active'));
      const activePill = document.getElementById('classPill-' + cat);
      if (activePill) activePill.classList.add('active');
      renderFilteredView();
    };

    function setFilter(key) {
      if (!FILTERS.length) return;
      let resolvedKey = key;
      if (!FILTERS.find((f) => f.key === key)) {
        resolvedKey = 'today-todo';
      }
      activeFilter = resolvedKey;
      vscode.postMessage({ type: 'saveFilter', key: resolvedKey });
      document.querySelectorAll('.stat-card, .filter-chip, .day-strip, .bar-row').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('[data-filter="' + key + '"]').forEach(el => el.classList.add('active'));
      renderFilteredView();
      document.getElementById('filtered-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderFilteredView() {
      const filter = FILTERS.find(f => f.key === activeFilter);
      if (!filter) return;

      const splitEl = document.getElementById('work-list-split');
      const singleEl = document.getElementById('work-list');

      document.getElementById('filter-title').textContent = filter.label;
      document.getElementById('filter-hint').textContent = filter.hint;

      // Calculate classification counts for active filter
      const allFilterItems = filter.split
        ? [...resolveItems(filter.overdueIds), ...resolveItems(filter.dueTodayIds)]
        : resolveItems(filter.itemIds);

      const storyCount = allFilterItems.filter(i => (i.classification || '').toLowerCase() === 'story').length;
      const taskCount = allFilterItems.filter(i => (i.classification || '').toLowerCase() === 'task').length;
      const bugCount = allFilterItems.filter(i => (i.classification || '').toLowerCase() === 'bug').length;

      const pAll = document.getElementById('pillCount-all');
      if (pAll) pAll.textContent = allFilterItems.length;
      const pStory = document.getElementById('pillCount-story');
      if (pStory) pStory.textContent = storyCount;
      const pTask = document.getElementById('pillCount-task');
      if (pTask) pTask.textContent = taskCount;
      const pBug = document.getElementById('pillCount-bug');
      if (pBug) pBug.textContent = bugCount;

      if (filter.split) {
        splitEl.classList.remove('hidden');
        singleEl.classList.add('hidden');
        const overdue = resolveItems(filter.overdueIds);
        const dueToday = resolveItems(filter.dueTodayIds);
        const total = overdue.length + dueToday.length;
        document.getElementById('filter-count').textContent = total + ' item' + (total === 1 ? '' : 's');
        document.getElementById('overdue-title').textContent = filter.splitLeftLabel || 'Overdue';
        document.getElementById('today-title').textContent = filter.splitRightLabel || 'Due Today';
        document.getElementById('overdue-count').textContent = overdue.length;
        document.getElementById('today-count').textContent = dueToday.length;
        const leftEmpty = filter.key === 'today-plan' ? 'Nothing open for today' : 'No overdue items — nice!';
        const rightEmpty = filter.key === 'today-plan' ? 'No tasks closed yet today' : 'Nothing due today';
        document.getElementById('overdue-list').innerHTML = renderItems(overdue, leftEmpty);
        document.getElementById('today-list').innerHTML = renderItems(dueToday, rightEmpty);
        return;
      }

      const items = resolveItems(filter.itemIds);
      document.getElementById('filter-count').textContent = items.length + ' item' + (items.length === 1 ? '' : 's');

      splitEl.classList.add('hidden');
      singleEl.classList.remove('hidden');
      singleEl.innerHTML = renderItems(items, 'No items in this view — great job!');
    }

    function renderItems(items, emptyMsg) {
      if (!items || items.length === 0) {
        return '<li class="empty-item">' + emptyMsg + '</li>';
      }

      // If user selected a specific classification filter ('story' | 'task' | 'bug')
      if (currentClassification !== 'all') {
        const filtered = items.filter(i => (i.classification || '').toLowerCase() === currentClassification);
        if (filtered.length === 0) {
          const catName = currentClassification === 'story' ? 'Stories' : currentClassification === 'bug' ? 'Bugs' : 'Tasks';
          return '<li class="empty-item">No ' + catName + ' in this view</li>';
        }
        return filtered.map(renderSingleItemCard).join('');
      }

      // Default: CLASSIFY Story, Task, Bug and render as separated distinct sections!
      const stories = items.filter(i => (i.classification || '').toLowerCase() === 'story');
      const tasks = items.filter(i => (i.classification || '').toLowerCase() === 'task');
      const bugs = items.filter(i => (i.classification || '').toLowerCase() === 'bug');

      let html = '';

      if (stories.length > 0) {
        html += '<li class="work-group-section group-story">' +
          '<div class="work-group-header">' +
            '<span class="work-group-icon">📖</span>' +
            '<h3 class="work-group-title">User Stories & Backlog Items</h3>' +
            '<span class="work-group-count">' + stories.length + '</span>' +
          '</div>' +
          '<ul class="work-group-list">' + stories.map(renderSingleItemCard).join('') + '</ul>' +
        '</li>';
      }

      if (tasks.length > 0) {
        html += '<li class="work-group-section group-task">' +
          '<div class="work-group-header">' +
            '<span class="work-group-icon">📋</span>' +
            '<h3 class="work-group-title">Engineering Tasks</h3>' +
            '<span class="work-group-count">' + tasks.length + '</span>' +
          '</div>' +
          '<ul class="work-group-list">' + tasks.map(renderSingleItemCard).join('') + '</ul>' +
        '</li>';
      }

      if (bugs.length > 0) {
        html += '<li class="work-group-section group-bug">' +
          '<div class="work-group-header">' +
            '<span class="work-group-icon">🐛</span>' +
            '<h3 class="work-group-title">Bugs & Defects</h3>' +
            '<span class="work-group-count">' + bugs.length + '</span>' +
          '</div>' +
          '<ul class="work-group-list">' + bugs.map(renderSingleItemCard).join('') + '</ul>' +
        '</li>';
      }

      return html || ('<li class="empty-item">' + emptyMsg + '</li>');
    }

    function renderSingleItemCard(item) {
      const due = item.dueDate ? ' · 📅 ' + new Date(item.dueDate).toLocaleDateString() : '';
      const status = item.statusLabel || item.state;
      const statusClass = item.timeStatus ? 'status-' + item.timeStatus : '';
      const classification = (item.classification || 'task').toLowerCase();

      let typeBadge = '';
      if (classification === 'story') {
        typeBadge = '<span class="wi-type-badge story">📖 ' + esc(item.workItemType) + '</span>';
      } else if (classification === 'bug') {
        typeBadge = '<span class="wi-type-badge bug">🐛 ' + esc(item.workItemType) + '</span>';
      } else {
        typeBadge = '<span class="wi-type-badge task">📋 ' + esc(item.workItemType) + '</span>';
      }

      const assignee = item.assignedTo ? '<span class="wi-assignee">👤 ' + esc(item.assignedTo) + '</span>' : '';

      return '<li class="work-item ' + statusClass + ' class-' + classification + '" onclick="openItem(' + item.id + ')">' +
        '<div class="wi-top">' +
          '<div class="wi-top-left">' +
            typeBadge +
            '<span class="wi-id">#' + item.id + '</span>' +
          '</div>' +
          '<span class="wi-pill status-tag">' + esc(status) + '</span>' +
        '</div>' +
        '<div class="wi-title">' + esc(item.title) + '</div>' +
        '<div class="wi-meta">' +
          assignee +
          '<span class="wi-state-tag">' + esc(item.state) + '</span>' +
          due +
        '</div>' +
      '</li>';
    }

    function esc(text) {
      const d = document.createElement('div');
      d.textContent = text || '';
      return d.innerHTML;
    }

    setFilter(activeFilter);
  </script>
</body>
</html>`;
    }
    renderDayStrip(section, id, filterKey) {
        const isToday = id === 'today';
        const alert = isToday && section.incompleteCount > 0;
        const ok = isToday && section.incompleteCount === 0 && section.totalCount > 0;
        let summary = '';
        if (id === 'tomorrow') {
            summary = `${section.totalCount} planned`;
        }
        else if (id === 'yesterday') {
            summary = `${section.completedCount} done · ${section.incompleteCount} open`;
        }
        else {
            summary = `${section.incompleteCount} to do · ${section.completedCount} done`;
            if (section.waitingCount > 0)
                summary += ` · ${section.waitingCount} waiting`;
        }
        const topItems = section.actionItems.slice(0, 3);
        const preview = topItems.length === 0
            ? '<div class="strip-empty">Nothing here</div>'
            : topItems
                .map((item) => `<div class="strip-item" onclick="event.stopPropagation(); openItem(${item.id})">#${item.id} ${(0, html_1.escapeHtml)(item.title.slice(0, 40))}${item.title.length > 40 ? '…' : ''}</div>`)
                .join('');
        return `
      <button class="day-strip${alert ? ' alert' : ''}${ok ? ' ok' : ''}" data-filter="${filterKey}" onclick="setFilter('${filterKey}')">
        <div class="strip-head">
          <strong>${(0, html_1.escapeHtml)(section.label)}</strong>
          <span>${(0, html_1.escapeHtml)(section.dateLabel)}</span>
        </div>
        <div class="strip-summary">${summary}</div>
        ${isToday ? `<div class="strip-progress"><div class="strip-fill" style="width:${section.completionPercent}%"></div></div>` : ''}
        <div class="strip-preview">${preview}</div>
        <div class="strip-action">Click to view all →</div>
      </button>`;
    }
    renderActiveSprintSection(sprint) {
        if (!sprint) {
            return `<section class="sprint-cockpit-section sprint-empty">
        <div class="sprint-cockpit-header">
          <div class="sprint-cockpit-title-group">
            <div class="sprint-cockpit-icon">🏃</div>
            <div>
              <div class="sprint-cockpit-title">Current Sprint</div>
              <div class="sprint-cockpit-dates">No active sprint timeframe configured in Azure DevOps or detected in tasks.</div>
            </div>
          </div>
          <button class="ai-btn secondary" onclick="refresh()">🔄 Check Sprints</button>
        </div>
      </section>`;
        }
        const percent = sprint.percent !== undefined
            ? sprint.percent
            : sprint.total > 0
                ? Math.round((sprint.completed / sprint.total) * 100)
                : 0;
        const isUrgent = sprint.daysRemaining !== undefined && sprint.daysRemaining <= 2;
        const isOverdue = sprint.daysRemaining !== undefined && sprint.daysRemaining < 0;
        let dateRangeStr = '';
        if (sprint.startDateFormatted && sprint.finishDateFormatted) {
            dateRangeStr = `${sprint.startDateFormatted} – ${sprint.finishDateFormatted}`;
        }
        else if (sprint.finishDateFormatted) {
            dateRangeStr = `Ends ${sprint.finishDateFormatted}`;
        }
        const badgeLabel = sprint.isAdoSprint ? '● Live ADO Sprint' : '● Active Sprint';
        return `<section class="sprint-cockpit-section">
      <div class="sprint-cockpit-header">
        <div class="sprint-cockpit-title-group">
          <div class="sprint-cockpit-icon">🏃</div>
          <div>
            <div class="sprint-cockpit-title">
              <span>${(0, html_1.escapeHtml)(sprint.name)}</span>
              <span class="sprint-live-tag">${(0, html_1.escapeHtml)(badgeLabel)}</span>
              ${sprint.daysRemainingLabel
            ? `<span class="sprint-time-tag ${isUrgent || isOverdue ? 'urgent' : ''}">⏳ ${(0, html_1.escapeHtml)(sprint.daysRemainingLabel)}</span>`
            : ''}
            </div>
            <div class="sprint-cockpit-dates">
              ${dateRangeStr ? `<span>📅 ${(0, html_1.escapeHtml)(dateRangeStr)}</span>` : ''}
              <span class="sprint-path-pill" title="Sprint Iteration Path">📁 ${(0, html_1.escapeHtml)(sprint.path)}</span>
            </div>
          </div>
        </div>

        <div class="sprint-cockpit-quick-action">
          <button class="ai-btn sprint-filter-btn" onclick="setFilter('current-sprint')" title="Filter engineering workboard to current sprint tasks">
            🎯 Filter Sprint Tasks (${sprint.total})
          </button>
        </div>
      </div>

      <div class="sprint-progress-container">
        <div class="sprint-progress-bar-bg">
          <div class="sprint-progress-bar-fill" style="width: ${percent}%;"></div>
        </div>
        <div class="sprint-progress-label">
          <span><strong>${percent}%</strong> Completed</span>
          <span>${sprint.completed} of ${sprint.total} work items resolved</span>
        </div>
      </div>

      <div class="sprint-metrics-grid">
        <div class="sprint-metric-chip completed" onclick="setFilter('current-sprint')" title="View sprint completed items">
          <span class="metric-icon">✅</span>
          <div class="metric-data">
            <span class="metric-num">${sprint.completed}</span>
            <span class="metric-text">Completed</span>
          </div>
        </div>
        <div class="sprint-metric-chip in-progress" onclick="setFilter('in-progress')" title="View in-progress items">
          <span class="metric-icon">⚡</span>
          <div class="metric-data">
            <span class="metric-num">${sprint.inProgress ?? 0}</span>
            <span class="metric-text">In Progress</span>
          </div>
        </div>
        <div class="sprint-metric-chip remaining" onclick="setFilter('current-sprint')" title="View sprint remaining items">
          <span class="metric-icon">⏳</span>
          <div class="metric-data">
            <span class="metric-num">${sprint.pending}</span>
            <span class="metric-text">Remaining</span>
          </div>
        </div>
        <div class="sprint-metric-chip blocked ${(sprint.blocked ?? 0) > 0 ? 'alert' : ''}" onclick="setFilter('blocked')" title="View blocked items">
          <span class="metric-icon">🛑</span>
          <div class="metric-data">
            <span class="metric-num">${sprint.blocked ?? 0}</span>
            <span class="metric-text">Blocked</span>
          </div>
        </div>
      </div>

      <!-- SEPARATED SPRINT WORK BREAKDOWN: STORIES / TASKS / BUGS -->
      <div class="sprint-breakdown-row">
        <button class="breakdown-card story-card" onclick="setClassificationFilter('story')" title="Filter to User Stories in current sprint">
          <div class="breakdown-card-top">
            <span class="breakdown-card-icon">📖</span>
            <span class="breakdown-card-title">User Stories</span>
          </div>
          <div class="breakdown-card-main">
            <span class="breakdown-card-count">${sprint.storyCount ?? 0}</span>
            <span class="breakdown-card-sub">${sprint.storyCompleted ?? 0} closed · ${sprint.storyPending ?? 0} open</span>
          </div>
        </button>

        <button class="breakdown-card task-card" onclick="setClassificationFilter('task')" title="Filter to Tasks in current sprint">
          <div class="breakdown-card-top">
            <span class="breakdown-card-icon">📋</span>
            <span class="breakdown-card-title">Tasks</span>
          </div>
          <div class="breakdown-card-main">
            <span class="breakdown-card-count">${sprint.taskCount ?? 0}</span>
            <span class="breakdown-card-sub">${sprint.taskCompleted ?? 0} closed · ${sprint.taskPending ?? 0} open</span>
          </div>
        </button>

        <button class="breakdown-card bug-card ${(sprint.bugPending ?? 0) > 0 ? 'alert' : ''}" onclick="setClassificationFilter('bug')" title="Filter to Bugs in current sprint">
          <div class="breakdown-card-top">
            <span class="breakdown-card-icon">🐛</span>
            <span class="breakdown-card-title">Bugs</span>
          </div>
          <div class="breakdown-card-main">
            <span class="breakdown-card-count">${sprint.bugCount ?? 0}</span>
            <span class="breakdown-card-sub">${sprint.bugCompleted ?? 0} closed · ${sprint.bugPending ?? 0} open</span>
          </div>
        </button>
      </div>
    </section>`;
    }
    renderSprintProgress(sprint) {
        const percent = sprint.total > 0 ? Math.round((sprint.completed / sprint.total) * 100) : 0;
        return `
      <div class="sprint-name">${(0, html_1.escapeHtml)(sprint.name)}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
      <div class="sprint-meta"><span>${sprint.completed} done</span><span>${sprint.pending} left</span><span>${percent}%</span></div>`;
    }
    renderClickableBars(groups, prefix, fullGroups) {
        if (groups.length === 0) {
            return '<div class="empty">No data</div>';
        }
        const max = groups[0].count;
        return groups
            .map((group, index) => {
            const fullLabel = fullGroups?.[index]?.label ?? group.fullLabel ?? group.label;
            const filterKey = `${prefix}-${this.slugify(fullLabel)}`;
            const width = max > 0 ? Math.round((group.count / max) * 100) : 0;
            return `<button class="bar-row" data-filter="${filterKey}" onclick="setFilter('${filterKey}')" title="Click to filter ${(0, html_1.escapeHtml)(group.label)}">
          <div class="bar-label">${(0, html_1.escapeHtml)(group.label)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
          <div class="bar-count">${group.count}</div>
        </button>`;
        })
            .join('');
    }
    renderBars(groups) {
        if (groups.length === 0) {
            return '<div class="empty">No data</div>';
        }
        const max = groups[0].count;
        return groups
            .map((group) => {
            const width = max > 0 ? Math.round((group.count / max) * 100) : 0;
            return `<div class="bar-row">
          <div class="bar-label">${(0, html_1.escapeHtml)(group.label)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
          <div class="bar-count">${group.count}</div>
        </div>`;
        })
            .join('');
    }
    dashboardStyles() {
        return `
      :root {
        --sg-bg-base: var(--vscode-editor-background);
        --sg-fg-base: var(--vscode-foreground);
        --sg-fg-muted: var(--vscode-descriptionForeground);
        --sg-card-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
        --sg-card-border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.2)));
        --sg-hover-bg: var(--vscode-list-hoverBackground);
        --sg-input-bg: var(--vscode-input-background);
        --sg-input-fg: var(--vscode-input-foreground);
        --sg-input-border: var(--vscode-input-border, rgba(128, 128, 128, 0.25));

        /* Theme-calibrated accessible accents (Light mode high contrast defaults) */
        --sg-cyan: #0284c7;
        --sg-cyan-bg: rgba(2, 132, 199, 0.08);
        --sg-cyan-border: rgba(2, 132, 199, 0.35);

        --sg-green: #15803d;
        --sg-green-bg: rgba(21, 128, 61, 0.08);
        --sg-green-border: rgba(21, 128, 61, 0.35);

        --sg-amber: #b45309;
        --sg-amber-bg: rgba(180, 83, 9, 0.08);
        --sg-amber-border: rgba(180, 83, 9, 0.35);

        --sg-rose: #be123c;
        --sg-rose-bg: rgba(190, 18, 60, 0.08);
        --sg-rose-border: rgba(190, 18, 60, 0.35);

        --sg-purple: #6d28d9;
        --sg-purple-bg: rgba(109, 40, 217, 0.08);
        --sg-purple-border: rgba(109, 40, 217, 0.35);

        --sg-border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.2)));
        --sg-surface: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
        --sg-surface-subtle: rgba(128, 128, 128, 0.06);
        --sg-surface-nested: rgba(128, 128, 128, 0.06);
        --sg-header-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
        --sg-header-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
        --sg-card-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
      }

      /* Dark & High Contrast theme overrides for luminous accents and dark panels */
      body.vscode-dark, body.vscode-high-contrast {
        --sg-cyan: #38bdf8;
        --sg-cyan-bg: rgba(56, 189, 248, 0.12);
        --sg-cyan-border: rgba(56, 189, 248, 0.35);

        --sg-green: #34d399;
        --sg-green-bg: rgba(52, 211, 153, 0.12);
        --sg-green-border: rgba(52, 211, 153, 0.35);

        --sg-amber: #fbbf24;
        --sg-amber-bg: rgba(251, 191, 36, 0.12);
        --sg-amber-border: rgba(251, 191, 36, 0.35);

        --sg-rose: #fb7185;
        --sg-rose-bg: rgba(251, 113, 133, 0.12);
        --sg-rose-border: rgba(251, 113, 133, 0.35);

        --sg-purple: #c084fc;
        --sg-purple-bg: rgba(192, 132, 252, 0.12);
        --sg-purple-border: rgba(192, 132, 252, 0.35);

        --sg-surface-subtle: rgba(255, 255, 255, 0.04);
        --sg-surface-nested: rgba(0, 0, 0, 0.22);
        --sg-header-bg: linear-gradient(135deg, rgba(14, 20, 33, 0.95), rgba(20, 27, 44, 0.95));
        --sg-header-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        --sg-card-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }

      /* COCKPIT TOP BAR */
      .cockpit-top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        background: var(--sg-header-bg);
        border: 1px solid var(--sg-border);
        border-radius: 12px;
        padding: 12px 18px;
        margin-bottom: 16px;
        box-shadow: var(--sg-header-shadow);
      }
      .cockpit-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .cockpit-logo-glow {
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #0284c7, #7c3aed);
        border-radius: 10px;
        display: grid;
        place-items: center;
        font-size: 18px;
        color: #ffffff;
        box-shadow: 0 2px 10px rgba(2, 132, 199, 0.3);
      }
      .cockpit-title {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.01em;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--vscode-foreground);
      }
      .cockpit-version-tag {
        font-size: 10px;
        padding: 2px 8px;
        background: var(--sg-cyan-bg);
        color: var(--sg-cyan);
        border-radius: 999px;
        font-weight: 700;
        border: 1px solid var(--sg-cyan-border);
      }
      .cockpit-subtitle {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 2px;
      }
      .cockpit-project-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--sg-cyan-bg);
        border: 1px solid var(--sg-cyan-border);
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        color: var(--vscode-foreground);
      }
      .cockpit-project-pill:hover {
        background: var(--sg-cyan);
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(2, 132, 199, 0.25);
      }
      .cockpit-project-pill strong {
        color: inherit;
        font-family: var(--vscode-editor-font-family);
      }
      .pill-action {
        font-size: 10px;
        opacity: 0.85;
        text-decoration: underline;
        margin-left: 2px;
      }
      .cockpit-role-switcher {
        display: flex;
        align-items: center;
        gap: 4px;
        background: var(--sg-surface-nested);
        padding: 4px;
        border-radius: 20px;
        border: 1px solid var(--sg-border);
      }
      .role-switcher-label {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        font-weight: 600;
        margin: 0 6px 0 8px;
      }
      .role-pill-btn {
        background: transparent;
        border: 1px solid transparent;
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .role-pill-btn:hover {
        color: var(--vscode-foreground);
        background: var(--sg-hover-bg);
      }
      .role-pill-btn.active {
        background: var(--sg-cyan-bg);
        color: var(--sg-cyan);
        border-color: var(--sg-cyan-border);
        font-weight: 700;
      }

      /* 5-TAB COCKPIT NAVIGATION */
      .cockpit-tabs-nav {
        display: flex;
        gap: 4px;
        margin-bottom: 18px;
        border-bottom: 1px solid var(--sg-border);
        padding-bottom: 0;
        overflow-x: auto;
      }
      .cockpit-tab-btn {
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--vscode-descriptionForeground);
        font-size: 13px;
        font-weight: 600;
        padding: 10px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
        white-space: nowrap;
        margin-bottom: -1px;
      }
      .cockpit-tab-btn:hover {
        color: var(--vscode-foreground);
        background: var(--sg-surface-subtle);
      }
      .cockpit-tab-btn.active {
        color: var(--sg-cyan);
        border-bottom-color: var(--sg-cyan);
        background: var(--sg-cyan-bg);
      }
      .cockpit-tab-panel {
        display: none;
      }
      .cockpit-tab-panel.active {
        display: block;
        animation: fadeIn 0.2s ease-in-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(3px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* STUDIO CARDS & FORMS */
      .studio-card {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 12px;
        padding: 18px 20px;
        margin-bottom: 18px;
        box-shadow: var(--sg-card-shadow);
      }
      .studio-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 14px;
        border-bottom: 1px solid var(--sg-border);
        padding-bottom: 10px;
        gap: 12px;
        flex-wrap: wrap;
      }
      .studio-card-head h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--vscode-foreground);
      }
      .card-desc {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
      }
      .code-badge {
        font-family: var(--vscode-editor-font-family);
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 6px;
        background: var(--sg-cyan-bg);
        border: 1px solid var(--sg-cyan-border);
        color: var(--sg-cyan);
      }
      .commander-philosophy-banner {
        background: var(--sg-cyan-bg);
        border: 1px solid var(--sg-cyan-border);
        border-radius: 12px;
        padding: 14px 18px;
        margin-bottom: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .philosophy-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .philosophy-header h3 {
        margin: 0 0 2px;
        font-size: 14px;
        color: var(--sg-cyan);
      }
      .philosophy-header p {
        margin: 0;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        max-width: 820px;
      }
      .pill-group {
        display: flex;
        gap: 6px;
      }
      .badge-tag {
        font-size: 10px;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        color: var(--vscode-foreground);
        font-weight: 600;
      }
      .studio-textarea {
        width: 100%;
        background: var(--sg-input-bg);
        border: 1px solid var(--sg-input-border);
        border-radius: 8px;
        color: var(--sg-input-fg);
        padding: 10px 12px;
        font-family: inherit;
        font-size: 13px;
        resize: vertical;
        box-sizing: border-box;
      }
      .studio-textarea:focus, .studio-input:focus, .studio-select:focus {
        outline: none;
        border-color: var(--vscode-focusBorder, var(--sg-cyan));
        box-shadow: 0 0 0 1px var(--vscode-focusBorder, var(--sg-cyan));
      }
      .studio-input {
        background: var(--sg-input-bg);
        border: 1px solid var(--sg-input-border);
        border-radius: 6px;
        color: var(--sg-input-fg);
        padding: 8px 12px;
        font-size: 13px;
        width: 100%;
        box-sizing: border-box;
      }
      .studio-select {
        background: var(--sg-input-bg);
        border: 1px solid var(--sg-input-border);
        border-radius: 6px;
        color: var(--sg-input-fg);
        padding: 8px 10px;
        font-size: 12px;
        width: 100%;
      }
      .quick-chips-row {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      .quick-chip-btn {
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        color: var(--vscode-foreground);
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .quick-chip-btn:hover {
        color: var(--sg-cyan);
        border-color: var(--sg-cyan);
        background: var(--sg-cyan-bg);
      }
      .grid-3 {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .grid-4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }

      /* 6-LAYER DAG VISUALIZER */
      .dag-layers-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 6px 0;
      }
      .dag-layer-row {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      .dag-layer-label {
        min-width: 110px;
        font-size: 11px;
        font-weight: 700;
        color: var(--vscode-descriptionForeground);
        letter-spacing: 0.04em;
      }
      .dag-nodes-row {
        display: flex;
        gap: 10px;
        flex: 1;
        flex-wrap: wrap;
      }
      .dag-node {
        flex: 1;
        min-width: 180px;
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 8px;
        padding: 8px 12px;
        transition: all 0.3s ease;
      }
      .dag-node.running {
        border-color: var(--sg-cyan);
        box-shadow: 0 0 10px var(--sg-cyan-border);
      }
      .dag-node.completed {
        border-color: var(--sg-green);
        box-shadow: 0 0 10px var(--sg-green-border);
      }
      .dag-node.failed {
        border-color: var(--sg-rose);
        box-shadow: 0 0 10px var(--sg-rose-border);
      }
      .dag-node-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
        font-size: 12px;
      }
      .dag-node-desc {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.3;
      }
      .dag-arrow {
        text-align: center;
        color: var(--sg-cyan);
        font-weight: bold;
        font-size: 14px;
        line-height: 1;
      }
      .status-pill {
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 999px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .status-pill.waiting { background: var(--sg-surface-nested); color: var(--vscode-descriptionForeground); }
      .status-pill.running { background: var(--sg-cyan-bg); color: var(--sg-cyan); animation: pulse 1.5s infinite; }
      .status-pill.completed { background: var(--sg-green-bg); color: var(--sg-green); }
      .status-pill.failed { background: var(--sg-rose-bg); color: var(--sg-rose); }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* EVENT TERMINAL */
      .event-terminal {
        background: var(--vscode-terminal-background, #070a10);
        border: 1px solid var(--sg-border);
        font-family: var(--vscode-editor-font-family);
        font-size: 11px;
        color: var(--vscode-terminal-foreground, #93c5fd);
        padding: 12px;
        border-radius: 8px;
        max-height: 200px;
        overflow-y: auto;
      }
      .terminal-line {
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .terminal-line.system {
        color: var(--vscode-descriptionForeground);
        font-style: italic;
      }
      .mini-stat-card {
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 8px;
        padding: 10px;
        text-align: center;
      }
      .mini-stat-card b {
        display: block;
        font-size: 20px;
        color: var(--vscode-foreground);
      }
      .mini-stat-card span {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
      }

      /* FLOW TRACEABILITY & WAITING MATRIX */
      .flow-pipeline-row {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        padding: 10px 0;
      }
      .flow-step-box {
        flex: 1;
        min-width: 110px;
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 8px;
        padding: 10px 6px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .flow-icon { font-size: 18px; margin-bottom: 2px; }
      .flow-step-box strong { font-size: 11px; margin-bottom: 4px; }
      .flow-tag {
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--sg-cyan-bg);
        color: var(--sg-cyan);
        border: 1px solid var(--sg-cyan-border);
      }
      .flow-pipe {
        color: var(--sg-cyan);
        font-weight: bold;
        font-size: 14px;
      }
      .waiting-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .waiting-card {
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 8px;
        padding: 12px;
      }
      .waiting-head {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--sg-border);
        padding-bottom: 4px;
      }
      .waiting-body {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .waiting-item {
        padding: 4px 0;
        border-bottom: 1px dashed var(--sg-border);
      }

      /* ROLE COCKPIT TOOLKITS */
      .role-toolkit-panel {
        display: none;
      }
      .role-toolkit-panel.active {
        display: block;
        animation: fadeIn 0.2s ease-in-out;
      }
      .toolkit-card {
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 8px;
        padding: 14px;
      }
      .toolkit-card h4 {
        margin: 0 0 6px 0;
        font-size: 13px;
        color: var(--vscode-foreground);
      }
      .toolkit-card p {
        margin: 0 0 12px 0;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.4;
      }

      /* COCKPIT SECTIONS & WORKBOARDS */
      .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      .workspace-banner { background:var(--sg-card-bg); border:1px solid var(--sg-border);
        border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:12px; }
      .subtitle { color:var(--vscode-descriptionForeground); font-size:12px; margin-top:4px; }
      .smart-summary { background:var(--sg-cyan-bg); border:1px solid var(--sg-cyan-border); border-radius:10px;
        padding:12px 16px; margin-bottom:16px; font-size:13px; line-height:1.5; color:var(--vscode-foreground); }

      /* SPRINT COCKPIT CARD */
      .sprint-cockpit-section {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 20px;
        box-shadow: var(--sg-card-shadow);
        border-top: 3px solid var(--sg-cyan);
      }
      .sprint-cockpit-section.sprint-empty {
        border-top: 1px solid var(--sg-border);
        opacity: 0.85;
      }
      .sprint-cockpit-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 14px;
      }
      .sprint-cockpit-title-group {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .sprint-cockpit-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: var(--sg-cyan-bg);
        border: 1px solid var(--sg-cyan-border);
        display: grid;
        place-items: center;
        font-size: 18px;
      }
      .sprint-cockpit-title {
        font-size: 15px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        color: var(--vscode-foreground);
      }
      .sprint-live-tag {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--sg-green-bg);
        color: var(--sg-green);
        border: 1px solid var(--sg-green-border);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .sprint-time-tag {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--sg-cyan-bg);
        color: var(--sg-cyan);
        border: 1px solid var(--sg-cyan-border);
      }
      .sprint-time-tag.urgent {
        background: var(--sg-amber-bg);
        color: var(--sg-amber);
        border-color: var(--sg-amber-border);
      }
      .sprint-cockpit-dates {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 3px;
        flex-wrap: wrap;
      }
      .sprint-path-pill {
        font-family: var(--vscode-editor-font-family);
        background: var(--sg-surface-nested);
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid var(--sg-border);
      }
      .sprint-filter-btn {
        background: var(--sg-cyan-bg);
        color: var(--sg-cyan);
        border: 1px solid var(--sg-cyan-border);
        font-weight: 600;
        transition: all 0.2s;
      }
      .sprint-filter-btn:hover {
        background: var(--sg-cyan);
        color: #ffffff;
      }
      .sprint-progress-container {
        margin-bottom: 14px;
      }
      .sprint-progress-bar-bg {
        width: 100%;
        height: 8px;
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 999px;
        overflow: hidden;
      }
      .sprint-progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--sg-cyan), var(--sg-green));
        border-radius: 999px;
        transition: width 0.4s ease;
      }
      .sprint-progress-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
      }
      .sprint-progress-label strong {
        color: var(--vscode-foreground);
      }
      .sprint-metrics-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }
      .sprint-metric-chip {
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 8px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        transition: transform 0.15s, border-color 0.15s;
      }
      .sprint-metric-chip:hover {
        transform: translateY(-1px);
        border-color: var(--sg-cyan);
      }
      .sprint-metric-chip .metric-icon {
        font-size: 16px;
      }
      .sprint-metric-chip .metric-data {
        display: flex;
        flex-direction: column;
      }
      .sprint-metric-chip .metric-num {
        font-size: 15px;
        font-weight: 700;
        color: var(--vscode-foreground);
      }
      .sprint-metric-chip.completed .metric-num {
        color: var(--sg-green);
      }
      .sprint-metric-chip.in-progress .metric-num {
        color: var(--sg-cyan);
      }
      .sprint-metric-chip.remaining .metric-num {
        color: var(--vscode-foreground);
      }
      .sprint-metric-chip.blocked.alert .metric-num {
        color: var(--sg-rose);
      }
      .sprint-metric-chip .metric-text {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 600;
      }
      @media (max-width: 600px) {
        .sprint-metrics-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* SPRINT CLASSIFICATION BREAKDOWN */
      .sprint-breakdown-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-top: 14px;
      }
      .breakdown-card {
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 8px;
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        color: var(--vscode-foreground);
        font-family: inherit;
      }
      .breakdown-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }
      .breakdown-card.story-card {
        border-top: 3px solid var(--sg-cyan);
      }
      .breakdown-card.story-card:hover {
        border-color: var(--sg-cyan);
      }
      .breakdown-card.task-card {
        border-top: 3px solid var(--sg-amber);
      }
      .breakdown-card.task-card:hover {
        border-color: var(--sg-amber);
      }
      .breakdown-card.bug-card {
        border-top: 3px solid var(--sg-rose);
      }
      .breakdown-card.bug-card:hover {
        border-color: var(--sg-rose);
      }
      .breakdown-card.bug-card.alert {
        background: var(--sg-rose-bg);
      }
      .breakdown-card-top {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }
      .breakdown-card-icon {
        font-size: 14px;
      }
      .breakdown-card-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--vscode-descriptionForeground);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .breakdown-card-main {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 6px;
        flex-wrap: wrap;
      }
      .breakdown-card-count {
        font-size: 20px;
        font-weight: 700;
      }
      .story-card .breakdown-card-count {
        color: var(--sg-cyan);
      }
      .task-card .breakdown-card-count {
        color: var(--sg-amber);
      }
      .bug-card .breakdown-card-count {
        color: var(--sg-rose);
      }
      .breakdown-card-sub {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
      }

      .ai-section { background:var(--sg-card-bg); border:1px solid var(--sg-border);
        border-radius:12px; padding:16px; margin-bottom:20px; box-shadow:var(--sg-card-shadow); }
      .hub-section { background:var(--sg-card-bg); border:1px solid var(--sg-border);
        border-radius:12px; padding:16px; margin-bottom:20px; box-shadow:var(--sg-card-shadow); }
      .hub-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
      .hub-stats { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; }
      .hub-stat { background:var(--sg-surface-nested); border:1px solid var(--sg-border); border-radius:8px; padding:10px; text-align:center; }
      .hub-stat b { display:block; font-size:18px; color:var(--sg-cyan); font-weight:700; }
      .hub-stat span { font-size:10px; color:var(--vscode-descriptionForeground); }
      .hub-presence { font-size:12px; color:var(--vscode-descriptionForeground); }
      .hub-err { color:var(--sg-rose); }
      .ai-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
      .ai-title { margin:0; font-size:16px; }
      .ai-subtitle { margin:4px 0 0; font-size:12px; color:var(--vscode-descriptionForeground); }
      .ai-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
      .ai-card { background:var(--sg-surface-nested); border:1px solid var(--sg-border);
        border-radius:10px; padding:12px; }
      .ai-card.recommend { border-top:3px solid var(--sg-cyan); }
      .ai-card.git { border-top:3px solid var(--sg-green); }
      .ai-card.alerts { border-top:3px solid var(--sg-amber); }
      .ai-card.standup { grid-column:1 / -1; border-top:3px solid var(--sg-purple); }
      .ai-card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
      .ai-badge { font-size:10px; text-transform:uppercase; letter-spacing:0.05em; font-weight:700;
        color:var(--vscode-descriptionForeground); }
      .ai-score { font-size:11px; font-weight:700; color:var(--sg-cyan); }
      .ai-task-btn { width:100%; text-align:left; background:transparent; border:none; color:var(--vscode-foreground);
        cursor:pointer; padding:4px 0; font-size:13px; line-height:1.4; }
      .ai-task-btn:hover strong { text-decoration:underline; }
      .ai-reason { font-size:12px; color:var(--vscode-descriptionForeground); margin:6px 0 10px; }
      .ai-git-branch { font-family:var(--vscode-editor-font-family); font-size:13px; margin:0 0 10px; }
      .ai-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .ai-btn { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
        border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500; }
      .ai-btn:hover { background:var(--vscode-button-hoverBackground); }
      .ai-btn.secondary { background:var(--vscode-button-secondaryBackground);
        color:var(--vscode-button-secondaryForeground); }
      .ai-btn.primary { font-weight:600; background: linear-gradient(135deg, #0284c7, #6366f1); color:#ffffff; }
      .ai-alerts { list-style:none; margin:0; padding:0; }
      .ai-alert { font-size:12px; padding:8px 10px; border-radius:6px; margin-bottom:6px; cursor:pointer; }
      .ai-alert:hover { filter:brightness(1.05); }
      .ai-alert.action { background:var(--sg-rose-bg); border-left:3px solid var(--sg-rose); color:var(--vscode-foreground); }
      .ai-alert.warning { background:var(--sg-amber-bg); border-left:3px solid var(--sg-amber); color:var(--vscode-foreground); }
      .ai-alert.info { background:var(--sg-cyan-bg); border-left:3px solid var(--sg-cyan); color:var(--vscode-foreground); }
      .ai-hint, .ai-empty { font-size:12px; color:var(--vscode-descriptionForeground); margin:0; }
      .ai-mismatch { background:var(--sg-rose-bg); border:1px solid var(--sg-rose-border); border-radius:8px; padding:10px 12px;
        font-size:12px; margin-bottom:12px; color:var(--vscode-foreground); }
      .ai-standup-preview { font-size:12px; line-height:1.6; color:var(--vscode-descriptionForeground);
        font-family:var(--vscode-editor-font-family); }
      .section-kicker { font-size:12px; color:var(--vscode-descriptionForeground); margin:0 0 10px; font-weight:500; }
      .section-title { font-size:15px; margin:0 0 4px; font-weight:700; color:var(--vscode-foreground); }
      .section-sub { font-size:12px; color:var(--vscode-descriptionForeground); margin:0 0 12px; }
      .counts-section { margin-bottom:18px; }

      /* MODERN KPI STAT CARDS */
      .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:12px; }
      .stat-card {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 10px;
        padding: 14px 10px;
        text-align: center;
        cursor: pointer;
        color: var(--vscode-foreground);
        box-shadow: var(--sg-card-shadow);
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        position: relative;
        overflow: hidden;
      }
      .stat-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: transparent;
        transition: background 0.2s ease;
      }
      .stat-card:hover {
        background: var(--sg-hover-bg);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }
      .stat-card.active {
        border-color: var(--sg-cyan);
        box-shadow: 0 0 0 1px var(--sg-cyan);
      }
      .stat-card.active::before {
        background: var(--sg-cyan);
      }
      .stat-card.alert {
        border-color: var(--sg-rose-border);
      }
      .stat-card.alert::before {
        background: var(--sg-rose);
      }
      .stat-card.alert.active {
        border-color: var(--sg-rose);
        box-shadow: 0 0 0 1px var(--sg-rose);
      }
      .stat-value {
        font-size: 28px;
        font-weight: 700;
        line-height: 1.1;
        font-family: var(--vscode-editor-font-family);
        font-variant-numeric: tabular-nums;
      }
      .stat-label {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 6px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .work-now .stat-value { color: var(--sg-rose); }
      .done-today .stat-value { color: var(--sg-green); }
      .today-plan .stat-value { color: var(--sg-cyan); }
      .overdue .stat-value { color: var(--sg-rose); }
      .today .stat-value { color: var(--sg-amber); }
      .progress .stat-value { color: var(--sg-cyan); }
      .blocked .stat-value { color: var(--sg-purple); }
      .waiting .stat-value { color: var(--sg-amber); }
      .tomorrow .stat-value { color: var(--sg-cyan); }
      .yesterday .stat-value { color: var(--sg-green); }

      /* FILTER CHIPS */
      .chip-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
      .filter-chip {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 12px;
        cursor: pointer;
        color: var(--vscode-foreground);
        transition: all 0.15s ease;
      }
      .filter-chip:hover {
        background: var(--sg-hover-bg);
        border-color: var(--vscode-focusBorder, var(--sg-cyan));
      }
      .filter-chip.active {
        border-color: var(--sg-cyan);
        background: var(--sg-cyan-bg);
        color: var(--sg-cyan);
        font-weight: 600;
      }
      .chip-count { font-weight:700; margin-left:4px; }

      /* FILTERED TASK PANEL & WORK ITEMS */
      .filtered-panel {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 20px;
        min-height: 120px;
        box-shadow: var(--sg-card-shadow);
      }
      .filtered-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--sg-border);
      }
      .filtered-header h2 { margin:0; font-size:16px; font-weight:700; color:var(--vscode-foreground); }
      .filter-hint { margin:4px 0 0; font-size:12px; color:var(--vscode-descriptionForeground); }
      .filter-count {
        font-size: 11px;
        font-weight: 700;
        color: var(--vscode-badge-foreground);
        background: var(--vscode-badge-background);
        padding: 3px 10px;
        border-radius: 12px;
      }
      .work-split { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
      .work-split.hidden { display:none; }
      .work-list.hidden { display:none; }
      .work-column {
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-radius: 10px;
        padding: 12px;
        min-height: 100px;
      }
      .overdue-col { border-top:3px solid var(--sg-rose); }
      .today-col { border-top:3px solid var(--sg-amber); }
      .col-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;
        padding-bottom:8px; border-bottom:1px solid var(--sg-border); }
      .col-header h3 { margin:0; font-size:13px; font-weight:700; }
      .overdue-col .col-header h3 { color:var(--sg-rose); }
      .today-col .col-header h3 { color:var(--sg-amber); }
      .col-count { font-size:11px; font-weight:700; background:var(--sg-surface-subtle);
        padding:2px 8px; border-radius:10px; border:1px solid var(--sg-border); }
      .work-list { list-style:none; padding:0; margin:0; max-height:480px; overflow-y:auto; }
      .work-item {
        padding: 12px 14px;
        border-radius: 8px;
        cursor: pointer;
        margin-bottom: 8px;
        background: var(--sg-surface-nested);
        border: 1px solid var(--sg-border);
        border-left: 4px solid var(--sg-cyan);
        transition: all 0.15s ease;
      }
      .work-item:hover {
        background: var(--sg-hover-bg);
        border-color: var(--vscode-focusBorder, var(--sg-cyan));
        transform: translateX(2px);
      }
      .work-item.status-overdue, .work-item.status-incomplete { border-left-color:var(--sg-rose); }
      .work-item.status-in-progress { border-left-color:var(--sg-cyan); }
      .work-item.status-on-hold, .work-item.status-blocked { border-left-color:var(--sg-amber); }
      .work-item.status-completed, .work-item.status-done-yesterday, .work-item.status-resolved { border-left-color:var(--sg-green); }
      .work-item.status-planned { border-left-color:var(--sg-purple); }
      .wi-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
      .wi-id { font-weight:700; font-size:12px; color:var(--sg-cyan); font-family:var(--vscode-editor-font-family); }
      .wi-pill {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 10px;
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .wi-title { font-size:13px; font-weight:600; margin-bottom:4px; color:var(--vscode-foreground); line-height:1.4; }
      .wi-meta { font-size:11px; color:var(--vscode-descriptionForeground); }
      .empty-item { padding:24px; text-align:center; color:var(--vscode-descriptionForeground); font-style:italic; }

      /* CLASSIFICATION BAR & PILLS */
      .classification-filter-bar {
        display: flex;
        gap: 8px;
        margin-bottom: 14px;
        padding: 4px 0;
        overflow-x: auto;
      }
      .class-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        background: var(--sg-surface-nested);
        color: var(--vscode-descriptionForeground);
        border: 1px solid var(--sg-border);
        cursor: pointer;
        transition: all 0.15s ease;
        font-family: inherit;
        white-space: nowrap;
      }
      .class-pill:hover {
        border-color: var(--sg-cyan);
        color: var(--vscode-foreground);
      }
      .class-pill.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: var(--vscode-button-background);
      }
      .class-pill.active.pill-story {
        background: var(--sg-cyan);
        color: #ffffff;
        border-color: var(--sg-cyan);
      }
      .class-pill.active.pill-task {
        background: var(--sg-amber);
        color: #ffffff;
        border-color: var(--sg-amber);
      }
      .class-pill.active.pill-bug {
        background: var(--sg-rose);
        color: #ffffff;
        border-color: var(--sg-rose);
      }
      .class-count {
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 700;
        background: rgba(128, 128, 128, 0.2);
      }
      .class-pill.active .class-count {
        background: rgba(255, 255, 255, 0.25);
        color: inherit;
      }

      /* WORK ITEM CLASSIFICATION GROUPED SECTIONS */
      .work-group-section {
        margin-bottom: 18px;
        list-style: none;
      }
      .work-group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 4px;
        margin-bottom: 10px;
        border-bottom: 1px solid var(--sg-border);
      }
      .work-group-icon {
        font-size: 15px;
      }
      .work-group-title {
        font-size: 12px;
        font-weight: 700;
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-foreground);
      }
      .group-story .work-group-title {
        color: var(--sg-cyan);
      }
      .group-task .work-group-title {
        color: var(--sg-amber);
      }
      .group-bug .work-group-title {
        color: var(--sg-rose);
      }
      .work-group-count {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: 10px;
        background: var(--sg-surface-subtle);
        border: 1px solid var(--sg-border);
        color: var(--vscode-descriptionForeground);
      }
      .work-group-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* WORK ITEM CLASSIFICATION BADGES & CARDS */
      .work-item.class-story {
        border-left: 4px solid var(--sg-cyan);
      }
      .work-item.class-task {
        border-left: 4px solid var(--sg-amber);
      }
      .work-item.class-bug {
        border-left: 4px solid var(--sg-rose);
      }
      .wi-top-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wi-type-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 5px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        letter-spacing: 0.02em;
      }
      .wi-type-badge.story {
        background: var(--sg-cyan-bg);
        color: var(--sg-cyan);
        border: 1px solid var(--sg-cyan-border);
      }
      .wi-type-badge.task {
        background: var(--sg-amber-bg);
        color: var(--sg-amber);
        border: 1px solid var(--sg-amber-border);
      }
      .wi-type-badge.bug {
        background: var(--sg-rose-bg);
        color: var(--sg-rose);
        border: 1px solid var(--sg-rose-border);
      }
      .wi-assignee {
        margin-right: 8px;
        color: var(--vscode-foreground);
        font-weight: 500;
      }
      .wi-state-tag {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--sg-surface-subtle);
        border: 1px solid var(--sg-border);
        font-size: 10px;
        font-weight: 600;
        color: var(--vscode-descriptionForeground);
      }

      /* DAILY FOCUS & CHARTS */
      .daily-focus { margin-bottom:20px; }
      .daily-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
      .day-strip {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 12px;
        padding: 14px;
        text-align: left;
        cursor: pointer;
        color: var(--vscode-foreground);
        width: 100%;
        box-shadow: var(--sg-card-shadow);
        transition: transform 0.15s ease;
      }
      .day-strip:hover { background:var(--sg-hover-bg); transform:translateY(-1px); }
      .day-strip.active { border-color:var(--sg-cyan); box-shadow:0 0 0 1px var(--sg-cyan); }
      .day-strip.alert { border-color:var(--sg-rose); }
      .day-strip.ok { border-color:var(--sg-green); }
      .strip-head { display:flex; justify-content:space-between; margin-bottom:6px; }
      .strip-head span { font-size:11px; color:var(--vscode-descriptionForeground); font-weight:600; }
      .strip-summary { font-size:12px; font-weight:600; margin-bottom:8px; }
      .strip-progress { height:5px; background:var(--sg-surface-nested); border-radius:3px; margin-bottom:8px; overflow:hidden; }
      .strip-fill { height:100%; background:var(--sg-green); border-radius:3px; }
      .strip-preview { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:8px; }
      .strip-item { padding:4px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .strip-item:hover { color:var(--vscode-foreground); }
      .strip-empty { font-style:italic; opacity:0.7; }
      .strip-action { font-size:11px; color:var(--sg-cyan); font-weight:600; }
      .charts-section { margin-bottom:20px; }
      .charts-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
      .chart-card {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 12px;
        padding: 14px;
        box-shadow: var(--sg-card-shadow);
      }
      .chart-card h3 { margin:0 0 4px; font-size:13px; font-weight:700; color:var(--vscode-foreground); }
      .chart-total { margin:0 0 12px; font-size:11px; color:var(--vscode-descriptionForeground); }
      .bar-row { display:grid; grid-template-columns:110px 1fr 36px; gap:8px; align-items:center;
        margin-bottom:8px; width:100%; background:transparent; border:1px solid transparent;
        border-radius:8px; padding:6px 8px; cursor:pointer; color:var(--vscode-foreground); text-align:left; }
      .bar-row:hover { background:var(--sg-hover-bg); border-color:var(--sg-border); }
      .bar-row.active { border-color:var(--sg-cyan); background:var(--sg-cyan-bg); }
      .bar-label { font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .bar-count { text-align:right; font-weight:700; font-size:12px; }
      .analytics { margin-bottom:16px; }
      .analytics summary { cursor:pointer; font-size:13px; font-weight:600; padding:8px 0; color:var(--vscode-descriptionForeground); }
      .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
      .card {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 10px;
        padding: 14px;
        box-shadow: var(--sg-card-shadow);
      }
      .card h3 { margin:0 0 10px; font-size:13px; color:var(--vscode-foreground); }
      .progress-bar, .bar-track { height:8px; background:var(--sg-surface-nested); border-radius:4px; overflow:hidden; }
      .progress-fill, .bar-fill { height:100%; background:var(--sg-cyan); border-radius:4px; transition:width 0.3s; }
      .bar-row.active .bar-fill { background:var(--sg-cyan); }
      .sprint-meta { font-size:11px; color:var(--vscode-descriptionForeground); }
      .actions {
        background: var(--sg-card-bg);
        border: 1px solid var(--sg-border);
        border-radius: 10px;
        padding: 16px;
        box-shadow: var(--sg-card-shadow);
      }
      .selected-line { font-size:12px; color:var(--vscode-descriptionForeground); margin-bottom:12px; }
      .btn-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
      .empty { font-size:12px; color:var(--vscode-descriptionForeground); }
      @media (max-width:1000px) {
        .stat-grid { grid-template-columns:repeat(2,1fr); }
        .work-split, .charts-grid, .grid-3, .waiting-grid { grid-template-columns:1fr; }
        .daily-grid, .grid-2, .btn-grid { grid-template-columns:1fr; }
      }
    `;
    }
}
exports.DashboardPanel = DashboardPanel;
//# sourceMappingURL=dashboardView.js.map