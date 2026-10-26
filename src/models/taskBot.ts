import { WorkItemListItem } from './query';

export type TaskBotScope = 'backlog' | 'active' | 'all' | 'mine';

export interface ParsedTaskBotQuery {
  keywords: string[];
  scope: TaskBotScope;
  workItemId?: number;
  assignedToMe: boolean;
  backlogStateNames: string[];
  stateNames: string[];
}

export interface TaskBotResultItem extends WorkItemListItem {
  relevanceScore: number;
  matchReason: string;
  descriptionPreview?: string;
}

export interface TaskBotSearchResponse {
  reply: string;
  items: TaskBotResultItem[];
  parsed: ParsedTaskBotQuery;
  wiql: string;
}

export interface TaskBotChatMessage {
  role: 'user' | 'bot';
  text: string;
  items?: TaskBotResultItem[];
  timestamp: string;
}
