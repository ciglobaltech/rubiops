import { WorkItemClassification } from '../utils/workItemStatus';

export interface DashboardWorkItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  project: string;
  changedDate: string;
  dueDate?: string;
  stateCategory: string;
  iterationPath: string;
  priority: string;
  areaPath: string;
  assignedTo: string;
  isAssignedToMe: boolean;
  tags: string[];
  classification?: WorkItemClassification;
  classificationLabel?: string;
  classificationIcon?: string;
}

export type TimeItemStatus =
  | 'completed'
  | 'done-yesterday'
  | 'in-progress'
  | 'incomplete'
  | 'overdue'
  | 'planned'
  | 'blocked'
  | 'on-hold'
  | 'resolved'
  | 'not-mine';

export interface TimedWorkItem extends DashboardWorkItem {
  timeStatus: TimeItemStatus;
  statusLabel: string;
}

export interface DayWorkSection {
  label: string;
  dateLabel: string;
  completedCount: number;
  incompleteCount: number;
  inProgressCount: number;
  waitingCount: number;
  totalCount: number;
  completionPercent: number;
  items: TimedWorkItem[];
  actionItems: TimedWorkItem[];
  waitingItems: TimedWorkItem[];
}

export interface DailyWorkPlan {
  yesterday: DayWorkSection;
  today: DayWorkSection;
  tomorrow: DayWorkSection;
}

export interface CountGroup {
  label: string;
  count: number;
}

export interface SprintSummary {
  path: string;
  name: string;
  total: number;
  completed: number;
  pending: number;
  inProgress?: number;
  blocked?: number;
  startDate?: string;
  finishDate?: string;
  startDateFormatted?: string;
  finishDateFormatted?: string;
  daysRemaining?: number;
  daysRemainingLabel?: string;
  percent?: number;
  isAdoSprint?: boolean;
  timeFrame?: string;
  teamName?: string;
  storyCount?: number;
  storyCompleted?: number;
  storyPending?: number;
  taskCount?: number;
  taskCompleted?: number;
  taskPending?: number;
  bugCount?: number;
  bugCompleted?: number;
  bugPending?: number;
}

export interface DashboardData {
  pendingCount: number;
  inProgressCount: number;
  blockedCount: number;
  overdueCount: number;
  closedYesterdayCount: number;
  closedTodayCount: number;
  overdueYesterdayCount: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
  changedTodayCount: number;
  highPriorityCount: number;
  staleCount: number;
  byWorkItemType: CountGroup[];
  byState: CountGroup[];
  byIteration: CountGroup[];
  currentSprint?: SprintSummary;
  currentSprintItems?: DashboardWorkItem[];
  stories: DashboardWorkItem[];
  tasks: DashboardWorkItem[];
  bugs: DashboardWorkItem[];
  storyCount: number;
  taskCount: number;
  bugCount: number;
  blocked: DashboardWorkItem[];
  overdue: DashboardWorkItem[];
  inProgress: DashboardWorkItem[];
  highPriority: DashboardWorkItem[];
  stale: DashboardWorkItem[];
  dueToday: DashboardWorkItem[];
  dueThisWeek: DashboardWorkItem[];
  closedYesterday: DashboardWorkItem[];
  closedToday: DashboardWorkItem[];
  overdueYesterday: DashboardWorkItem[];
  allClosedToday: DashboardWorkItem[];
  dailyPlan: DailyWorkPlan;
  allPending: DashboardWorkItem[];
  allOverdue: DashboardWorkItem[];
  allDueToday: DashboardWorkItem[];
  lastUpdated: string;
}
