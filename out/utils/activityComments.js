"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_NAME = void 0;
exports.hasTrackedChanges = hasTrackedChanges;
exports.formatWorkItemUpdateComment = formatWorkItemUpdateComment;
exports.formatBranchCreatedComment = formatBranchCreatedComment;
exports.TOOL_NAME = 'RubiOps';
function hasTrackedChanges(log) {
    return Boolean(log.stateChange || log.assigneeChange || log.descriptionUpdated || log.hoursLogged);
}
function formatWorkItemUpdateComment(log) {
    const lines = ['Work item updated', '', `Work item: #${log.workItemId}`];
    if (log.stateChange) {
        lines.push(`Status: ${log.stateChange.from} → ${log.stateChange.to}`);
    }
    if (log.assigneeChange) {
        lines.push(`Assigned to: ${log.assigneeChange.from} → ${log.assigneeChange.to}`);
    }
    if (log.descriptionUpdated) {
        lines.push('Description: updated');
    }
    if (log.hoursLogged) {
        lines.push(`Time logged: +${log.hoursLogged.spent}h (Completed Work: ${log.hoursLogged.totalCompletedWork}h)`);
    }
    lines.push('', `Changed by: ${log.changedBy}`, `Added by: ${exports.TOOL_NAME} extension`);
    return lines.join('\n');
}
function formatBranchCreatedComment(workItemId, baseBranch, newBranch, createdBy) {
    return [
        'Git branch created',
        '',
        `Work item: #${workItemId}`,
        `Base branch: ${baseBranch}`,
        `New branch: ${newBranch}`,
        `Created by: ${createdBy}`,
        `Added by: ${exports.TOOL_NAME} extension`,
    ].join('\n');
}
//# sourceMappingURL=activityComments.js.map