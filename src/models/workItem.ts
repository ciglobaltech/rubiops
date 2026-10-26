export interface WorkItem {
  id: number;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  state: string;
  priority: string;
  areaPath: string;
  iterationPath: string;
  assignedTo: string;
  assignedToUniqueName?: string;
  tags: string[];
  url: string;
  workItemType: string;
  project: string;
  parentId?: number;
  parentTitle?: string;
  parentState?: string;
  parentType?: string;
  dueDate?: string;
  changedDate: string;
  createdDate: string;
  completedWork?: number;
  remainingWork?: number;
  stateCategory?: string;
  isAssignedToMe?: boolean;
}

export interface WorkItemSummary {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  project: string;
}

export interface AzureDevOpsConfig {
  organizationUrl: string;
  project?: string;
}
