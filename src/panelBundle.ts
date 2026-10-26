import { DashboardPanel } from './views/dashboardView';
import { AgentChatPanel } from './views/agentChatPanel';
import { QueryPanel } from './views/queryPanel';
import { TaskBotPanel } from './views/taskBotPanel';
import { TasksListPanel } from './views/tasksListPanel';
import { WorkItemDetailsPanel } from './views/workItemDetails';
import { TasksTreeProvider } from './providers/tasksTreeProvider';

export interface PanelBundle {
  dashboardPanel: DashboardPanel;
  agentChatPanel: AgentChatPanel;
  tasksListPanel: TasksListPanel;
  queryPanel: QueryPanel;
  taskBotPanel: TaskBotPanel;
  detailsPanel: WorkItemDetailsPanel;
  tasksTreeProvider: TasksTreeProvider;
}

