"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHoldState = isHoldState;
exports.isBlockedState = isBlockedState;
exports.isResolvedCategory = isResolvedCategory;
exports.isAssignedToUser = isAssignedToUser;
exports.getStatusDisplay = getStatusDisplay;
exports.needsMyWork = needsMyWork;
exports.classifyWorkItemType = classifyWorkItemType;
exports.getClassificationInfo = getClassificationInfo;
function isHoldState(state) {
    return state.toLowerCase().includes('hold');
}
function isBlockedState(state) {
    return state.toLowerCase().includes('block');
}
function isResolvedCategory(category) {
    return category === 'Completed' || category === 'Removed';
}
function isAssignedToUser(assignedTo, currentUser) {
    if (!assignedTo || assignedTo === 'Unassigned') {
        return false;
    }
    const normalize = (value) => value.trim().toLowerCase();
    const assigned = normalize(assignedTo);
    const user = normalize(currentUser);
    return assigned === user || assigned.includes(user) || user.includes(assigned);
}
function getStatusDisplay(state, stateCategory, assignedTo, currentUser) {
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
function needsMyWork(state, stateCategory, assignedTo, currentUser) {
    const display = getStatusDisplay(state, stateCategory, assignedTo, currentUser);
    return display.actionStatus === 'action-needed' || display.actionStatus === 'in-progress';
}
function classifyWorkItemType(type) {
    const lower = (type || '').toLowerCase().trim();
    if (lower.includes('bug') || lower.includes('defect')) {
        return 'bug';
    }
    if (lower.includes('story') ||
        lower.includes('backlog') ||
        lower.includes('requirement') ||
        lower.includes('feature') ||
        lower.includes('epic')) {
        return 'story';
    }
    return 'task';
}
function getClassificationInfo(type) {
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
//# sourceMappingURL=workItemStatus.js.map