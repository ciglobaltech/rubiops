import * as vscode from 'vscode';
import { CountGroup, DailyWorkPlan, DashboardData, DashboardWorkItem, DayWorkSection, SprintSummary, TimedWorkItem, TimeItemStatus } from '../models/dashboard';
import { WorkItemTypeState } from '../models/workItemState';
import {
  addDays,
  daysSince,
  isBeforeDay,
  isWithinDay,
  formatDayLabel,
  parseAdoDate,
  startOfDay,
} from '../utils/dates';
import { AdoSprintDetails } from '../azure/azureDevOpsClient';
import {
  classifyWorkItemType,
  getClassificationInfo,
  isAssignedToUser,
  isBlockedState,
  isHoldState,
  isResolvedCategory,
} from '../utils/workItemStatus';

function getTodayAssignedTag(): string {
  return (
    vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .get<string>('bugWatch.todayAssignedTag', 'TodayAssigned')
      ?.trim() || 'TodayAssigned'
  );
}

export interface RawDashboardItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  project: string;
  changedDate?: string;
  dueDate?: string;
  stateCategory: string;
  iterationPath: string;
  priority: string;
  areaPath: string;
  assignedTo: string;
  tags: string[];
}

export class DashboardService {
  buildDashboard(
    items: RawDashboardItem[],
    currentUserName: string,
    adoSprint?: AdoSprintDetails
  ): DashboardData {
    const itemsWithAssignment = items.map((item) => ({
      ...item,
      isAssignedToMe: isAssignedToUser(item.assignedTo, currentUserName),
    }));
    const today = startOfDay(new Date());
    const yesterday = addDays(today, -1);

    const pending = itemsWithAssignment.filter((item) => !this.isInactive(item.stateCategory));
    const inProgress = pending.filter((item) => item.stateCategory === 'InProgress');
    const blocked = pending.filter((item) => isBlockedState(item.state));
    const overdue = pending.filter((item) => isBeforeDay(parseAdoDate(item.dueDate), today));
    const closedYesterday = itemsWithAssignment.filter(
      (item) =>
        this.isInactive(item.stateCategory) &&
        isWithinDay(parseAdoDate(item.changedDate), yesterday)
    );
    const closedToday = itemsWithAssignment.filter(
      (item) =>
        this.isInactive(item.stateCategory) &&
        isWithinDay(parseAdoDate(item.changedDate), today)
    );
    const overdueYesterday = pending.filter((item) =>
      isWithinDay(parseAdoDate(item.dueDate), yesterday)
    );
    const dueToday = pending.filter((item) =>
      isWithinDay(parseAdoDate(item.dueDate), today)
    );
    const weekEnd = addDays(today, 7);
    const dueThisWeek = pending.filter((item) => {
      const due = parseAdoDate(item.dueDate);
      if (!due) {
        return false;
      }
      const dueDay = startOfDay(due);
      return dueDay > today && dueDay <= weekEnd;
    });
    const changedToday = itemsWithAssignment.filter((item) =>
      isWithinDay(parseAdoDate(item.changedDate), today)
    );
    const highPriority = pending.filter((item) => this.isHighPriority(item.priority));
    const stale = pending.filter((item) => {
      const days = daysSince(parseAdoDate(item.changedDate));
      return days !== undefined && days >= 7;
    });

    const currentSprint = this.detectCurrentSprint(itemsWithAssignment, adoSprint);
    const dailyPlan = this.buildDailyPlan(itemsWithAssignment, today, yesterday, addDays(today, 1), currentUserName);

    const currentSprintItems = currentSprint
      ? itemsWithAssignment
          .filter((item) => {
            if (!item.iterationPath) return false;
            const normItem = item.iterationPath.replace(/^\\+/, '').toLowerCase();
            const normPath = currentSprint.path.replace(/^\\+/, '').toLowerCase();
            const normName = currentSprint.name.toLowerCase();
            return (
              normItem === normPath ||
              normItem.endsWith('\\' + normName) ||
              normItem === normName
            );
          })
          .map((item) => this.toDashboardItem(item, item.isAssignedToMe))
      : [];

    const allDashboardItems = itemsWithAssignment.map((item) =>
      this.toDashboardItem(item, item.isAssignedToMe)
    );
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
      byIteration: this.groupCounts(
        pending.filter((item) => item.iterationPath),
        (item) => item.iterationPath
      ).slice(0, 6),
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

  private buildDailyPlan(
    items: Array<RawDashboardItem & { isAssignedToMe: boolean }>,
    today: Date,
    yesterday: Date,
    tomorrow: Date,
    currentUserName: string
  ): DailyWorkPlan {
    const yesterdayWorked = items
      .filter((item) => this.isYesterdayWorkItem(item, yesterday))
      .map((item) => this.toTimedItem(item, today, 'yesterday', currentUserName))
      .sort((a, b) => this.compareTimedItems(a, b));

    const todayWork = items
      .filter((item) => this.isTodayWorkItem(item, today))
      .map((item) => this.toTimedItem(item, today, 'today', currentUserName))
      .sort((a, b) => this.compareTimedItems(a, b));

    const tomorrowPlan = items
      .filter(
        (item) =>
          !this.isInactive(item.stateCategory) &&
          isWithinDay(parseAdoDate(item.dueDate), tomorrow)
      )
      .map((item) => this.toTimedItem(item, today, 'tomorrow', currentUserName))
      .sort((a, b) => this.compareTimedItems(a, b));

    return {
      yesterday: this.buildDaySection('Yesterday', yesterday, yesterdayWorked),
      today: this.buildDaySection('Today', today, todayWork),
      tomorrow: this.buildDaySection('Tomorrow', tomorrow, tomorrowPlan),
    };
  }

  private isYesterdayWorkItem(item: RawDashboardItem, yesterday: Date): boolean {
    const changed = parseAdoDate(item.changedDate);
    const due = parseAdoDate(item.dueDate);
    if (isWithinDay(changed, yesterday)) {
      return true;
    }
    if (isWithinDay(due, yesterday)) {
      return true;
    }
    return false;
  }

  private isTodayWorkItem(
    item: RawDashboardItem & { isAssignedToMe: boolean },
    today: Date
  ): boolean {
    if (!item.isAssignedToMe) {
      return false;
    }

    const todayTag = getTodayAssignedTag();
    const isBug = item.workItemType.toLowerCase() === 'bug';
    const hasTodayAssigned = (item.tags ?? []).some(
      (tag) => tag.toLowerCase() === todayTag.toLowerCase()
    );

    // Bugs enter Today only via TodayAssigned tag — not due date.
    if (isBug) {
      if (!hasTodayAssigned) {
        return false;
      }
      const inactive = this.isInactive(item.stateCategory);
      if (inactive) {
        return isWithinDay(parseAdoDate(item.changedDate), today);
      }
      return true;
    }

    const due = parseAdoDate(item.dueDate);
    const changed = parseAdoDate(item.changedDate);
    const inactive = this.isInactive(item.stateCategory);

    if (inactive) {
      return isWithinDay(changed, today);
    }

    if (isHoldState(item.state) || isBlockedState(item.state)) {
      return (
        isWithinDay(changed, today) ||
        isWithinDay(due, today) ||
        Boolean(due && isBeforeDay(due, today))
      );
    }

    if (hasTodayAssigned) {
      return true;
    }
    if (isWithinDay(due, today)) {
      return true;
    }
    if (isWithinDay(changed, today)) {
      return true;
    }
    if (due && isBeforeDay(due, today)) {
      return true;
    }
    if (item.stateCategory === 'InProgress') {
      const days = daysSince(changed);
      return days !== undefined && days <= 7;
    }
    return false;
  }

  private buildDaySection(label: string, date: Date, items: TimedWorkItem[]): DayWorkSection {
    const actionItems = items.filter((item) =>
      ['incomplete', 'overdue', 'in-progress', 'completed', 'done-yesterday', 'planned'].includes(
        item.timeStatus
      )
    );
    const waitingItems = items.filter((item) =>
      ['on-hold', 'blocked', 'resolved', 'not-mine'].includes(item.timeStatus)
    );

    const completedCount = actionItems.filter(
      (item) => item.timeStatus === 'completed' || item.timeStatus === 'done-yesterday'
    ).length;
    const inProgressCount = actionItems.filter((item) => item.timeStatus === 'in-progress').length;
    const incompleteCount = actionItems.filter(
      (item) => item.timeStatus === 'incomplete' || item.timeStatus === 'overdue'
    ).length;
    const waitingCount = waitingItems.length;

    const completionPercent =
      label === 'Tomorrow'
        ? 0
        : label === 'Today'
          ? this.calcTodayCompletion(actionItems)
          : items.length > 0
            ? Math.round((completedCount / items.length) * 100)
            : 0;

    return {
      label,
      dateLabel: formatDayLabel(date),
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

  private calcTodayCompletion(items: TimedWorkItem[]): number {
    const todos = items.filter(
      (item) =>
        item.timeStatus === 'incomplete' ||
        item.timeStatus === 'overdue' ||
        item.timeStatus === 'in-progress' ||
        item.timeStatus === 'completed'
    );
    if (todos.length === 0) {
      return 0;
    }
    const done = items.filter((item) => item.timeStatus === 'completed').length;
    return Math.round((done / todos.length) * 100);
  }

  private toTimedItem(
    item: RawDashboardItem & { isAssignedToMe: boolean },
    today: Date,
    dayContext: 'yesterday' | 'today' | 'tomorrow',
    currentUserName: string
  ): TimedWorkItem {
    const inactive = this.isInactive(item.stateCategory);
    const inProgress = item.stateCategory === 'InProgress';
    const due = parseAdoDate(item.dueDate);
    const changed = parseAdoDate(item.changedDate);
    const hold = isHoldState(item.state);
    const blocked = isBlockedState(item.state);
    const assignedToMe = isAssignedToUser(item.assignedTo, currentUserName);

    let timeStatus: TimeItemStatus;
    let statusLabel: string;

    if (!assignedToMe) {
      timeStatus = 'not-mine';
      statusLabel = `Assigned to ${item.assignedTo}`;
    } else if (dayContext === 'tomorrow') {
      timeStatus = 'planned';
      statusLabel = 'Planned';
    } else if (inactive && isWithinDay(changed, today)) {
      timeStatus = 'completed';
      statusLabel = 'Done today';
    } else if (inactive || isResolvedCategory(item.stateCategory)) {
      timeStatus = dayContext === 'yesterday' ? 'done-yesterday' : 'resolved';
      statusLabel = 'Resolved';
    } else if (hold) {
      timeStatus = 'on-hold';
      statusLabel = 'On Hold - No Action';
    } else if (blocked) {
      timeStatus = 'blocked';
      statusLabel = 'Blocked - Waiting';
    } else if (
      dayContext === 'yesterday' &&
      due &&
      isWithinDay(due, addDays(today, -1)) &&
      !inactive
    ) {
      timeStatus = 'overdue';
      statusLabel = 'Not completed';
    } else if (due && isBeforeDay(due, today)) {
      timeStatus = 'overdue';
      statusLabel = 'Overdue - Action Needed';
    } else if (inProgress) {
      timeStatus = 'in-progress';
      statusLabel = 'In Progress';
    } else if (dayContext === 'today' && due && isWithinDay(due, today)) {
      timeStatus = 'incomplete';
      statusLabel = 'Due today';
    } else {
      timeStatus = 'incomplete';
      statusLabel = 'To Do';
    }

    return {
      ...this.toDashboardItem(item, assignedToMe),
      timeStatus,
      statusLabel,
    };
  }

  private compareTimedItems(a: TimedWorkItem, b: TimedWorkItem): number {
    const order: Record<TimeItemStatus, number> = {
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

  private detectCurrentSprint(
    items: RawDashboardItem[],
    adoSprint?: AdoSprintDetails
  ): SprintSummary | undefined {
    if (adoSprint) {
      const normAdoPath = adoSprint.path.replace(/^\\+/, '').toLowerCase();
      const normAdoName = adoSprint.name.toLowerCase();

      const sprintItems = items.filter((item) => {
        if (!item.iterationPath) return false;
        const normItemPath = item.iterationPath.replace(/^\\+/, '').toLowerCase();
        return (
          normItemPath === normAdoPath ||
          normItemPath.endsWith('\\' + normAdoName) ||
          normItemPath === normAdoName
        );
      });

      const completed = sprintItems.filter((item) => this.isInactive(item.stateCategory)).length;
      const inProgress = sprintItems.filter((item) => item.stateCategory === 'InProgress').length;
      const blocked = sprintItems.filter((item) => isBlockedState(item.state)).length;
      const pending = sprintItems.length - completed;
      const percent = sprintItems.length > 0 ? Math.round((completed / sprintItems.length) * 100) : 0;

      let daysRemaining: number | undefined;
      let daysRemainingLabel: string | undefined;
      let startDateFormatted: string | undefined;
      let finishDateFormatted: string | undefined;

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
          } else if (daysRemaining === 0) {
            daysRemainingLabel = 'Ends today';
          } else if (daysRemaining === 1) {
            daysRemainingLabel = '1 day left';
          } else {
            daysRemainingLabel = `${daysRemaining} days left`;
          }
        }
      }

      const stories = sprintItems.filter((i) => classifyWorkItemType(i.workItemType) === 'story');
      const tasks = sprintItems.filter((i) => classifyWorkItemType(i.workItemType) === 'task');
      const bugs = sprintItems.filter((i) => classifyWorkItemType(i.workItemType) === 'bug');

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

    const iterationCounts = new Map<string, number>();
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
    const blocked = sprintItems.filter((item) => isBlockedState(item.state)).length;
    const pending = sprintItems.length - completed;
    const percent = sprintItems.length > 0 ? Math.round((completed / sprintItems.length) * 100) : 0;

    const heurStories = sprintItems.filter((i) => classifyWorkItemType(i.workItemType) === 'story');
    const heurTasks = sprintItems.filter((i) => classifyWorkItemType(i.workItemType) === 'task');
    const heurBugs = sprintItems.filter((i) => classifyWorkItemType(i.workItemType) === 'bug');

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

  private groupCounts(items: RawDashboardItem[], keyFn: (item: RawDashboardItem) => string): CountGroup[] {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = keyFn(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  private isInactive(category: string): boolean {
    return category === 'Completed' || category === 'Removed';
  }

  private isHighPriority(priority: string): boolean {
    const value = Number(priority);
    return !Number.isNaN(value) && value <= 2;
  }

  private toDashboardItem(
    item: RawDashboardItem,
    isAssignedToMe: boolean
  ): DashboardWorkItem {
    const classInfo = getClassificationInfo(item.workItemType);
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

export function resolveStateCategory(
  orgStates: WorkItemTypeState[],
  stateName: string
): string {
  return orgStates.find((state) => state.name === stateName)?.category ?? 'Unknown';
}
