export const TOOL_NAME = 'RubiOps';

export interface WorkItemChangeLog {
  workItemId: number;
  changedBy: string;
  stateChange?: { from: string; to: string };
  assigneeChange?: { from: string; to: string };
  descriptionUpdated?: boolean;
  hoursLogged?: { spent: number; totalCompletedWork: number };
}

export function hasTrackedChanges(log: WorkItemChangeLog): boolean {
  return Boolean(
    log.stateChange || log.assigneeChange || log.descriptionUpdated || log.hoursLogged
  );
}

export function formatWorkItemUpdateComment(log: WorkItemChangeLog): string {
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
    lines.push(
      `Time logged: +${log.hoursLogged.spent}h (Completed Work: ${log.hoursLogged.totalCompletedWork}h)`
    );
  }

  lines.push('', `Changed by: ${log.changedBy}`, `Added by: ${TOOL_NAME} extension`);
  return lines.join('\n');
}

export function formatBranchCreatedComment(
  workItemId: number,
  baseBranch: string,
  newBranch: string,
  createdBy: string
): string {
  return [
    'Git branch created',
    '',
    `Work item: #${workItemId}`,
    `Base branch: ${baseBranch}`,
    `New branch: ${newBranch}`,
    `Created by: ${createdBy}`,
    `Added by: ${TOOL_NAME} extension`,
  ].join('\n');
}
