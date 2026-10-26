export type WorkItemAction = 'startWork' | 'complete' | 'blocked';

export interface WorkItemTypeState {
  name: string;
  category: string;
  color?: string;
}

export interface ValidTransitionContext {
  workItemId: number;
  workItemType: string;
  project: string;
  currentState: string;
  parentId?: number;
  parentTitle?: string;
  parentState?: string;
  parentType?: string;
  validStates: WorkItemTypeState[];
}
