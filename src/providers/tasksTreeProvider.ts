import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { WorkItemSummary } from '../models/workItem';
import { WorkItemService } from '../services/workItemService';
import { COMMANDS } from '../utils/constants';

export class WorkItemTreeItem extends vscode.TreeItem {
  constructor(
    public readonly workItem: WorkItemSummary,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(`${workItem.id} — ${workItem.title}`, collapsibleState);
    this.description = `${workItem.workItemType} · ${workItem.state}`;
    this.tooltip = `${workItem.id}: ${workItem.title}\nType: ${workItem.workItemType}\nState: ${workItem.state}`;
    this.contextValue = 'workItem';
    this.iconPath = new vscode.ThemeIcon('checklist');
    this.command = {
      command: COMMANDS.OPEN_WORK_ITEM,
      title: 'Open Work Item',
      arguments: [workItem.id, workItem.title],
    };
  }
}

class ConnectTreeItem extends vscode.TreeItem {
  constructor() {
    super('Connect to Azure DevOps', vscode.TreeItemCollapsibleState.None);
    this.description = 'Click to sign in';
    this.iconPath = new vscode.ThemeIcon('plug');
    this.command = {
      command: COMMANDS.CONNECT,
      title: 'Connect Azure DevOps',
    };
  }
}

class EmptyTreeItem extends vscode.TreeItem {
  constructor() {
    super('No active work items assigned to you', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

export class TasksTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly workItemService: WorkItemService,
    private readonly authService: AuthService
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    const isAuthenticated = await this.authService.isAuthenticated();
    if (!isAuthenticated) {
      return [new ConnectTreeItem()];
    }

    try {
      const workItems = await this.workItemService.getAssignedWorkItems();
      if (workItems.length === 0) {
        return [new EmptyTreeItem()];
      }

      return workItems.map(
        (item) => new WorkItemTreeItem(item, vscode.TreeItemCollapsibleState.None)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load work items';
      vscode.window.showErrorMessage(message);
      return [new ConnectTreeItem()];
    }
  }

  getWorkItemId(item: WorkItemTreeItem): number {
    return item.workItem.id;
  }
}
