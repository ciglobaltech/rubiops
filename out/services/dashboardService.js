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
exports.DashboardService = void 0;
exports.resolveStateCategory = resolveStateCategory;
const vscode = __importStar(require("vscode"));
const dates_1 = require("../utils/dates");
const workItemStatus_1 = require("../utils/workItemStatus");
function getTodayAssignedTag() {
    return (vscode.workspace
        .getConfiguration('devopsQuickUpdate')
        .get('bugWatch.todayAssignedTag', 'TodayAssigned')
        ?.trim() || 'TodayAssigned');
}
class DashboardService {
    buildDashboard(items, currentUserName, adoSprint) {
        const itemsWithAssignment = items.map((item) => ({
            ...item,
            isAssignedToMe: (0, workItemStatus_1.isAssignedToUser)(item.assignedTo, currentUserName),
        }));
        const today = (0, dates_1.startOfDay)(new Date());
        const yesterday = (0, dates_1.addDays)(today, -1);
        const pending = itemsWithAssignment.filter((item) => !this.isInactive(item.stateCategory));
        const inProgress = pending.filter((item) => item.stateCategory === 'InProgress');
        const blocked = pending.filter((item) => (0, workItemStatus_1.isBlockedState)(item.state));
        const overdue = pending.filter((item) => (0, dates_1.isBeforeDay)((0, dates_1.parseAdoDate)(item.dueDate), today));
        const closedYesterday = itemsWithAssignment.filter((item) => this.isInactive(item.stateCategory) &&
            (0, dates_1.isWithinDay)((0, dates_1.parseAdoDate)(item.changedDate), yesterday));
        const closedToday = itemsWithAssignment.filter((item) => this.isInactive(item.stateCategory) &&
            (0, dates_1.isWithinDay)((0, dates_1.parseAdoDate)(item.changedDate), today));
        const overdueYesterday = pending.filter((item) => (0, dates_1.isWithinDay)((0, dates_1.parseAdoDate)(item.dueDate), yesterday));
        const dueToday = pending.filter((item) => (0, dates_1.isWithinDay)((0, dates_1.parseAdoDate)(item.dueDate), today));
        const weekEnd = (0, dates_1.addDays)(today, 7);
        const dueThisWeek = pending.filter((item) => {
            const due = (0, dates_1.parseAdoDate)(item.dueDate);
            if (!due) {
                return false;
            }
            const dueDay = (0, dates_1.startOfDay)(due);
            return dueDay > today && dueDay <= weekEnd;
        });
        const changedToday = itemsWithAssignment.filter((item) => (0, dates_1.isWithinDay)((0, dates_1.parseAdoDate)(item.changedDate), today));
        const highPriority = pending.filter((item) => this.isHighPriority(item.priority));
        const stale = pending.filter((item) => {
            const days = (0, dates_1.daysSince)((0, dates_1.parseAdoDate)(item.changedDate));
            return days !== undefined && days >= 7;
        });
        const currentSprint = this.detectCurrentSprint(itemsWithAssignment, adoSprint);
        const dailyPlan = this.buildDailyPlan(itemsWithAssignment, today, yesterday, (0, dates_1.addDays)(today, 1), currentUserName);
        const currentSprintItems = currentSprint
            ? itemsWithAssignment
                .filter((item) => {
                if (!item.iterationPath)
                    return false;
                const normItem = item.iterationPath.replace(/^\\+/, '').toLowerCase();
                const normPath = currentSprint.path.replace(/^\\+/, '').toLowerCase();
                const normName = currentSprint.name.toLowerCase();
                return (normItem === normPath ||
                    normItem.endsWith('\\' + normName) ||
                    normItem === normName);
            })
                .map((item) => this.toDashboardItem(item, item.isAssignedToMe))
            : [];
        const allDashboardItems = itemsWithAssignment.map((item) => this.toDashboardItem(item, item.isAssignedToMe));
        const stories = allDashboardItems.filter((i) => i.classification === 'story');
        const tasks = allDashboardItems.filter((i) => i.classification === 'task');
        const bugs = allDashboardItems.filter((i) => i.classification === 'bug');
        return {
            pendingCount: pending.length,
            inProgressCount: inProgress.length,
            blockedCount: blocked.length,
            overdueCount: overdue.length,
            closedYesterdayCount: closedYesterday.length,
            closedTodayCount: closedToday.length,
            overdueYesterdayCount: overdueYesterday.length,
            dueTodayCount: dueToday.length,
            dueThisWeekCount: dueThisWeek.length,
            changedTodayCount: changedToday.length,
            highPriorityCount: highPriority.length,
            staleCount: stale.length,
            byWorkItemType: this.groupCounts(pending, (item) => item.workItemType),
            byState: this.groupCounts(pending, (item) => item.state),
            byIteration: this.groupCounts(pending.filter((item) => item.iterationPath), (item) => item.iterationPath).slice(0, 6),
            currentSprint,
            currentSprintItems,
            stories,
            tasks,
            bugs,
            storyCount: stories.length,
            taskCount: tasks.length,
            bugCount: bugs.length,
            blocked: blocked.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            overdue: overdue.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            inProgress: inProgress.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            highPriority: highPriority.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            stale: stale.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            dueToday: dueToday.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            dueThisWeek: dueThisWeek.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            closedYesterday: closedYesterday.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            closedToday: closedToday.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            overdueYesterday: overdueYesterday.slice(0, 8).map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            dailyPlan,
            allPending: pending.map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            allOverdue: overdue.map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            allDueToday: dueToday.map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            allClosedToday: closedToday.map((item) => this.toDashboardItem(item, item.isAssignedToMe)),
            lastUpdated: new Date().toISOString(),
        };
    }
    buildDailyPlan(items, today, yesterday, tomorrow, currentUserName) {
        const yesterdayWorked = items
            .filter((item) => this.isYesterdayWorkItem(item, yesterday))
            .map((item) => this.toTimedItem(item, today, 'yesterday', currentUserName))
            .sort((a, b) => this.compareTimedItems(a, b));
        const todayWork = items
            .filter((item) => this.isTodayWorkItem(item, today))
            .map((item) => this.toTimedItem(item, today, 'today', currentUserName))
            .sort((a, b) => this.compareTimedItems(a, b));
        const tomorrowPlan = items
            .filter((item) => !this.isInactive(item.stateCategory) &&
            (0, dates_1.isWithinDay)((0, dates_1.parseAdoDate)(item.dueDate), tomorrow))
            .map((item) => this.toTimedItem(item, today, 'tomorrow', currentUserName))
            .sort((a, b) => this.compareTimedItems(a, b));
        return {
            yesterday: this.buildDaySection('Yesterday', yesterday, yesterdayWorked),
            today: this.buildDaySection('Today', today, todayWork),
            tomorrow: this.buildDaySection('Tomorrow', tomorrow, tomorrowPlan),
        };
    }
    isYesterdayWorkItem(item, yesterday) {
        const changed = (0, dates_1.parseAdoDate)(item.changedDate);
        const due = (0, dates_1.parseAdoDate)(item.dueDate);
        if ((0, dates_1.isWithinDay)(changed, yesterday)) {
            return true;
        }
        if ((0, dates_1.isWithinDay)(due, yesterday)) {
            return true;
        }
        return false;
    }
    isTodayWorkItem(item, today) {
        if (!item.isAssignedToMe) {
            return false;
        }
        const todayTag = getTodayAssignedTag();
        const isBug = item.workItemType.toLowerCase() === 'bug';
        const hasTodayAssigned = (item.tags ?? []).some((tag) => tag.toLowerCase() === todayTag.toLowerCase());
        // Bugs enter Today only via TodayAssigned tag — not due date.
        if (isBug) {
            if (!hasTodayAssigned) {
                return false;
            }
            const inactive = this.isInactive(item.stateCategory);
            if (inactive) {
                return (0, dates_1.isWithinDay)((0, dates_1.parseAdoDate)(item.changedDate), today);
            }
            return true;
        }
        const due = (0, dates_1.parseAdoDate)(item.dueDate);
        const changed = (0, dates_1.parseAdoDate)(item.changedDate);
        const inactive = this.isInactive(item.stateCategory);
        if (inactive) {
            return (0, dates_1.isWithinDay)(changed, today);
        }
        if ((0, workItemStatus_1.isHoldState)(item.state) || (0, workItemStatus_1.isBlockedState)(item.state)) {
            return ((0, dates_1.isWithinDay)(changed, today) ||
                (0, dates_1.isWithinDay)(due, today) ||
                Boolean(due && (0, dates_1.isBeforeDay)(due, today)));
        }
        if (hasTodayAssigned) {
            return true;
        }
        if ((0, dates_1.isWithinDay)(due, today)) {
            return true;
        }
        if ((0, dates_1.isWithinDay)(changed, today)) {
            return true;
        }
        if (due && (0, dates_1.isBeforeDay)(due, today)) {
            return true;
        }
        if (item.stateCategory === 'InProgress') {
            const days = (0, dates_1.daysSince)(changed);
            return days !== undefined && days <= 7;
        }
        return false;
    }
    buildDaySection(label, date, items) {
        const actionItems = items.filter((item) => ['incomplete', 'overdue', 'in-progress', 'completed', 'done-yesterday', 'planned'].includes(item.timeStatus));
        const waitingItems = items.filter((item) => ['on-hold', 'blocked', 'resolved', 'not-mine'].includes(item.timeStatus));
        const completedCount = actionItems.filter((item) => item.timeStatus === 'completed' || item.timeStatus === 'done-yesterday').length;
        const inProgressCount = actionItems.filter((item) => item.timeStatus === 'in-progress').length;
        const incompleteCount = actionItems.filter((item) => item.timeStatus === 'incomplete' || item.timeStatus === 'overdue').length;
        const waitingCount = waitingItems.length;
        const completionPercent = label === 'Tomorrow'
            ? 0
            : label === 'Today'
                ? this.calcTodayCompletion(actionItems)
                : items.length > 0
                    ? Math.round((completedCount / items.length) * 100)
                    : 0;
        return {
            label,
            dateLabel: (0, dates_1.formatDayLabel)(date),
            completedCount,
            incompleteCount,
            inProgressCount,
            waitingCount,
            totalCount: items.length,
            completionPercent,
            items: items.slice(0, 12),
            actionItems: actionItems.slice(0, 12),
            waitingItems: waitingItems.slice(0, 8),
        };
    }
    calcTodayCompletion(items) {
        const todos = items.filter((item) => item.timeStatus === 'incomplete' ||
            item.timeStatus === 'overdue' ||
            item.timeStatus === 'in-progress' ||
            item.timeStatus === 'completed');
        if (todos.length === 0) {
            return 0;
        }
        const done = items.filter((item) => item.timeStatus === 'completed').length;
        return Math.round((done / todos.length) * 100);
    }
    toTimedItem(item, today, dayContext, currentUserName) {
        const inactive = this.isInactive(item.stateCategory);
        const inProgress = item.stateCategory === 'InProgress';
        const due = (0, dates_1.parseAdoDate)(item.dueDate);
        const changed = (0, dates_1.parseAdoDate)(item.changedDate);
        const hold = (0, workItemStatus_1.isHoldState)(item.state);
        const blocked = (0, workItemStatus_1.isBlockedState)(item.state);
        const assignedToMe = (0, workItemStatus_1.isAssignedToUser)(item.assignedTo, currentUserName);
        let timeStatus;
        let statusLabel;
        if (!assignedToMe) {
            timeStatus = 'not-mine';
            statusLabel = `Assigned to ${item.assignedTo}`;
        }
        else if (dayContext === 'tomorrow') {
            timeStatus = 'planned';
            statusLabel = 'Planned';
        }
        else if (inactive && (0, dates_1.isWithinDay)(changed, today)) {
            timeStatus = 'completed';
            statusLabel = 'Done today';
        }
        else if (inactive || (0, workItemStatus_1.isResolvedCategory)(item.stateCategory)) {
            timeStatus = dayContext === 'yesterday' ? 'done-yesterday' : 'resolved';
            statusLabel = 'Resolved';
        }
        else if (hold) {
            timeStatus = 'on-hold';
            statusLabel = 'On Hold - No Action';
        }
        else if (blocked) {
            timeStatus = 'blocked';
            statusLabel = 'Blocked - Waiting';
        }
        else if (dayContext === 'yesterday' &&
            due &&
            (0, dates_1.isWithinDay)(due, (0, dates_1.addDays)(today, -1)) &&
            !inactive) {
            timeStatus = 'overdue';
            statusLabel = 'Not completed';
        }
        else if (due && (0, dates_1.isBeforeDay)(due, today)) {
            timeStatus = 'overdue';
            statusLabel = 'Overdue - Action Needed';
        }
        else if (inProgress) {
            timeStatus = 'in-progress';
            statusLabel = 'In Progress';
        }
        else if (dayContext === 'today' && due && (0, dates_1.isWithinDay)(due, today)) {
            timeStatus = 'incomplete';
            statusLabel = 'Due today';
        }
        else {
            timeStatus = 'incomplete';
            statusLabel = 'To Do';
        }
        return {
            ...this.toDashboardItem(item, assignedToMe),
            timeStatus,
            statusLabel,
        };
    }
    compareTimedItems(a, b) {
        const order = {
            overdue: 0,
            incomplete: 1,
            'in-progress': 2,
            blocked: 3,
            'on-hold': 4,
            'not-mine': 5,
            planned: 6,
            resolved: 7,
            completed: 8,
            'done-yesterday': 9,
        };
        const diff = order[a.timeStatus] - order[b.timeStatus];
        if (diff !== 0) {
            return diff;
        }
        return a.id - b.id;
    }
    detectCurrentSprint(items, adoSprint) {
        if (adoSprint) {
            const normAdoPath = adoSprint.path.replace(/^\\+/, '').toLowerCase();
            const normAdoName = adoSprint.name.toLowerCase();
            const sprintItems = items.filter((item) => {
                if (!item.iterationPath)
                    return false;
                const normItemPath = item.iterationPath.replace(/^\\+/, '').toLowerCase();
                return (normItemPath === normAdoPath ||
                    normItemPath.endsWith('\\' + normAdoName) ||
                    normItemPath === normAdoName);
            });
            const completed = sprintItems.filter((item) => this.isInactive(item.stateCategory)).length;
            const inProgress = sprintItems.filter((item) => item.stateCategory === 'InProgress').length;
            const blocked = sprintItems.filter((item) => (0, workItemStatus_1.isBlockedState)(item.state)).length;
            const pending = sprintItems.length - completed;
            const percent = sprintItems.length > 0 ? Math.round((completed / sprintItems.length) * 100) : 0;
            let daysRemaining;
            let daysRemainingLabel;
            let startDateFormatted;
            let finishDateFormatted;
            if (adoSprint.startDate) {
                const d = new Date(adoSprint.startDate);
                if (!Number.isNaN(d.getTime())) {
                    startDateFormatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }
            }
            if (adoSprint.finishDate) {
                const finish = new Date(adoSprint.finishDate);
                if (!Number.isNaN(finish.getTime())) {
                    finishDateFormatted = finish.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: finish.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                    });
                    const now = new Date();
                    const msDiff = finish.getTime() - now.getTime();
                    daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
                    if (daysRemaining < 0) {
                        daysRemainingLabel = `${Math.abs(daysRemaining)}d overdue`;
                    }
                    else if (daysRemaining === 0) {
                        daysRemainingLabel = 'Ends today';
                    }
                    else if (daysRemaining === 1) {
                        daysRemainingLabel = '1 day left';
                    }
                    else {
                        daysRemainingLabel = `${daysRemaining} days left`;
                    }
                }
            }
            const stories = sprintItems.filter((i) => (0, workItemStatus_1.classifyWorkItemType)(i.workItemType) === 'story');
            const tasks = sprintItems.filter((i) => (0, workItemStatus_1.classifyWorkItemType)(i.workItemType) === 'task');
            const bugs = sprintItems.filter((i) => (0, workItemStatus_1.classifyWorkItemType)(i.workItemType) === 'bug');
            const storyCompleted = stories.filter((i) => this.isInactive(i.stateCategory)).length;
            const storyPending = stories.length - storyCompleted;
            const taskCompleted = tasks.filter((i) => this.isInactive(i.stateCategory)).length;
            const taskPending = tasks.length - taskCompleted;
            const bugCompleted = bugs.filter((i) => this.isInactive(i.stateCategory)).length;
            const bugPending = bugs.length - bugCompleted;
            return {
                path: adoSprint.path,
                name: adoSprint.name,
                total: sprintItems.length,
                completed,
                pending,
                inProgress,
                blocked,
                startDate: adoSprint.startDate,
                finishDate: adoSprint.finishDate,
                startDateFormatted,
                finishDateFormatted,
                daysRemaining,
                daysRemainingLabel,
                percent,
                isAdoSprint: true,
                timeFrame: adoSprint.timeFrame,
                teamName: adoSprint.teamName,
                storyCount: stories.length,
                storyCompleted,
                storyPending,
                taskCount: tasks.length,
                taskCompleted,
                taskPending,
                bugCount: bugs.length,
                bugCompleted,
                bugPending,
            };
        }
        const iterationCounts = new Map();
        for (const item of items) {
            if (!item.iterationPath || this.isInactive(item.stateCategory)) {
                continue;
            }
            iterationCounts.set(item.iterationPath, (iterationCounts.get(item.iterationPath) ?? 0) + 1);
        }
        if (iterationCounts.size === 0) {
            return undefined;
        }
        const path = [...iterationCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const sprintItems = items.filter((item) => item.iterationPath === path);
        const completed = sprintItems.filter((item) => this.isInactive(item.stateCategory)).length;
        const inProgress = sprintItems.filter((item) => item.stateCategory === 'InProgress').length;
        const blocked = sprintItems.filter((item) => (0, workItemStatus_1.isBlockedState)(item.state)).length;
        const pending = sprintItems.length - completed;
        const percent = sprintItems.length > 0 ? Math.round((completed / sprintItems.length) * 100) : 0;
        const heurStories = sprintItems.filter((i) => (0, workItemStatus_1.classifyWorkItemType)(i.workItemType) === 'story');
        const heurTasks = sprintItems.filter((i) => (0, workItemStatus_1.classifyWorkItemType)(i.workItemType) === 'task');
        const heurBugs = sprintItems.filter((i) => (0, workItemStatus_1.classifyWorkItemType)(i.workItemType) === 'bug');
        const heurStoryCompleted = heurStories.filter((i) => this.isInactive(i.stateCategory)).length;
        const heurStoryPending = heurStories.length - heurStoryCompleted;
        const heurTaskCompleted = heurTasks.filter((i) => this.isInactive(i.stateCategory)).length;
        const heurTaskPending = heurTasks.length - heurTaskCompleted;
        const heurBugCompleted = heurBugs.filter((i) => this.isInactive(i.stateCategory)).length;
        const heurBugPending = heurBugs.length - heurBugCompleted;
        return {
            path,
            name: path.split('\\').pop() ?? path,
            total: sprintItems.length,
            completed,
            pending,
            inProgress,
            blocked,
            percent,
            isAdoSprint: false,
            storyCount: heurStories.length,
            storyCompleted: heurStoryCompleted,
            storyPending: heurStoryPending,
            taskCount: heurTasks.length,
            taskCompleted: heurTaskCompleted,
            taskPending: heurTaskPending,
            bugCount: heurBugs.length,
            bugCompleted: heurBugCompleted,
            bugPending: heurBugPending,
        };
    }
    groupCounts(items, keyFn) {
        const counts = new Map();
        for (const item of items) {
            const key = keyFn(item);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count);
    }
    isInactive(category) {
        return category === 'Completed' || category === 'Removed';
    }
    isHighPriority(priority) {
        const value = Number(priority);
        return !Number.isNaN(value) && value <= 2;
    }
    toDashboardItem(item, isAssignedToMe) {
        const classInfo = (0, workItemStatus_1.getClassificationInfo)(item.workItemType);
        return {
            id: item.id,
            title: item.title,
            state: item.state,
            workItemType: item.workItemType,
            project: item.project,
            changedDate: item.changedDate ?? '',
            dueDate: item.dueDate,
            stateCategory: item.stateCategory,
            iterationPath: item.iterationPath,
            priority: item.priority,
            areaPath: item.areaPath,
            assignedTo: item.assignedTo,
            isAssignedToMe,
            tags: item.tags ?? [],
            classification: classInfo.classification,
            classificationLabel: classInfo.label,
            classificationIcon: classInfo.icon,
        };
    }
}
exports.DashboardService = DashboardService;
function resolveStateCategory(orgStates, stateName) {
    return orgStates.find((state) => state.name === stateName)?.category ?? 'Unknown';
}
//# sourceMappingURL=dashboardService.js.map