export type ActionStatus =
  | 'action-needed'
  | 'in-progress'
  | 'on-hold'
  | 'blocked'
  | 'resolved'
  | 'not-assigned';

export interface StatusDisplay {
  actionStatus: ActionStatus;
  label: string;
  hint: string;
  cssClass: string;
}

export function isHoldState(state: string): boolean {
  return state.toLowerCase().includes('hold');
}

export function isBlockedState(state: string): boolean {
  return state.toLowerCase().includes('block');
}

export function isResolvedCategory(category: string): boolean {
  return category === 'Completed' || category === 'Removed';
}

export function isAssignedToUser(assignedTo: string, currentUser: string): boolean {
  if (!assignedTo || assignedTo === 'Unassigned') {
    return false;
  }
  const normalize = (value: string): string => value.trim().toLowerCase();
  const assigned = normalize(assignedTo);
  const user = normalize(currentUser);
  return assigned === user || assigned.includes(user) || user.includes(assigned);
}

export function getStatusDisplay(
  state: string,
  stateCategory: string,
  assignedTo: string,
  currentUser: string
): StatusDisplay {
  if (!isAssignedToUser(assignedTo, currentUser)) {
    return {
      actionStatus: 'not-assigned',
      label: state,
      hint: `Assigned to ${assignedTo} — not your active task`,
      cssClass: 'status-not-assigned',
    };
  }

  if (isResolvedCategory(stateCategory)) {
    return {
      actionStatus: 'resolved',
      label: state,
      hint: 'Resolved — no further work needed from you',
      cssClass: 'status-resolved',
    };
  }

  if (isHoldState(state)) {
    return {
      actionStatus: 'on-hold',
      label: state,
      hint: 'On hold — no action needed from you right now',
      cssClass: 'status-on-hold',
    };
  }

  if (isBlockedState(state)) {
    return {
      actionStatus: 'blocked',
      label: state,
      hint: 'Blocked — waiting on dependency or review',
      cssClass: 'status-blocked',
    };
  }

  if (stateCategory === 'InProgress') {
    return {
      actionStatus: 'in-progress',
      label: state,
      hint: 'In progress — your active work',
      cssClass: 'status-in-progress',
    };
  }

  return {
    actionStatus: 'action-needed',
    label: state,
    hint: 'Your action is needed',
    cssClass: 'status-action-needed',
  };
}

export function needsMyWork(
  state: string,
  stateCategory: string,
  assignedTo: string,
  currentUser: string
): boolean {
  const display = getStatusDisplay(state, stateCategory, assignedTo, currentUser);
  return display.actionStatus === 'action-needed' || display.actionStatus === 'in-progress';
}

export type WorkItemClassification = 'story' | 'task' | 'bug';

export function classifyWorkItemType(type: string): WorkItemClassification {
  const lower = (type || '').toLowerCase().trim();
  if (lower.includes('bug') || lower.includes('defect')) {
    return 'bug';
  }
  if (
    lower.includes('story') ||
    lower.includes('backlog') ||
    lower.includes('requirement') ||
    lower.includes('feature') ||
    lower.includes('epic')
  ) {
    return 'story';
  }
  return 'task';
}

export function getClassificationInfo(type: string): {
  classification: WorkItemClassification;
  label: string;
  icon: string;
  badgeClass: string;
} {
  const classification = classifyWorkItemType(type);
  switch (classification) {
    case 'story':
      return { classification, label: 'Story', icon: '📖', badgeClass: 'type-story' };
    case 'bug':
      return { classification, label: 'Bug', icon: '🐛', badgeClass: 'type-bug' };
    case 'task':
    default:
      return { classification, label: 'Task', icon: '📋', badgeClass: 'type-task' };
  }
}

