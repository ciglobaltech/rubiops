export interface WorkItemQueryFilter {
  assignedToMe: boolean;
  project?: string;
  iterationPath?: string;
  areaPath?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  state?: string;
  workItemType?: string;
  titleContains?: string;
  activeOnly: boolean;
}

export interface WorkItemListItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  project: string;
  iterationPath: string;
  dueDate?: string;
  changedDate: string;
  stateCategory: string;
}

export interface IterationOption {
  id: string;
  name: string;
  path: string;
}

export interface AreaOption {
  path: string;
  name: string;
  label: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface OrgStateOption {
  name: string;
  category: string;
}

export interface SearchFilterOptions {
  projects: ProjectOption[];
  areas: AreaOption[];
  iterations: IterationOption[];
  states: OrgStateOption[];
  workItemTypes: string[];
  defaultProject: string;
}
