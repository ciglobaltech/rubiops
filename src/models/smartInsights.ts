import { DashboardWorkItem } from './dashboard';

export interface GitBranchContext {
  isRepo: boolean;
  branchName?: string;
  linkedWorkItemId?: number;
}

export interface RecommendedTask {
  workItem: DashboardWorkItem;
  score: number;
  reason: string;
}

export interface SmartAlert {
  level: 'info' | 'warning' | 'action';
  message: string;
  workItemId?: number;
  filterKey?: string;
}

export interface SmartInsights {
  recommended?: RecommendedTask;
  gitContext: GitBranchContext;
  alerts: SmartAlert[];
  standupSummary: string;
  commitMessage?: string;
  focusMismatch?: {
    branchWorkItemId: number;
    suggestedWorkItemId: number;
    message: string;
  };
}
