export interface ProjectMember {
  id: string;
  displayName: string;
  uniqueName: string;
}

export interface WorkItemFieldUpdate {
  state?: string;
  description?: string;
  assignedToUniqueName?: string | null;
  comment?: string;
  hoursSpent?: number;
  completedWork?: number;
  remainingWork?: number;
}

export interface WorkItemEditContext {
  workItem: import('./workItem').WorkItem;
  validStates: import('./workItemState').WorkItemTypeState[];
  allOrgStates: import('./workItemState').WorkItemTypeState[];
  members: ProjectMember[];
  comments: import('./workItemComment').WorkItemComment[];
  currentUser: string;
}
