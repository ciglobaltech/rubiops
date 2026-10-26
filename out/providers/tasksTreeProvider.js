"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksTreeProvider = exports.WorkItemTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../utils/constants");
class WorkItemTreeItem extends vscode.TreeItem {
    workItem;
    collapsibleState;
    constructor(workItem, collapsibleState) {
        super(`${workItem.id} — ${workItem.title}`, collapsibleState);
        this.workItem = workItem;
        this.collapsibleState = collapsibleState;
        this.description = `${workItem.workItemType} · ${workItem.state}`;
        this.tooltip = `${workItem.id}: ${workItem.title}\nType: ${workItem.workItemType}\nState: ${workItem.state}`;
        this.contextValue = 'workItem';
        this.iconPath = new vscode.ThemeIcon('checklist');
        this.command = {
            command: constants_1.COMMANDS.OPEN_WORK_ITEM,
            title: 'Open Work Item',
            arguments: [workItem.id, workItem.title],
        };
    }
}
exports.WorkItemTreeItem = WorkItemTreeItem;
class ConnectTreeItem extends vscode.TreeItem {
    constructor() {
        super('Connect to Azure DevOps', vscode.TreeItemCollapsibleState.None);
        this.description = 'Click to sign in';
        this.iconPath = new vscode.ThemeIcon('plug');
        this.command = {
            command: constants_1.COMMANDS.CONNECT,
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
class TasksTreeProvider {
    workItemService;
    authService;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(workItemService, authService) {
        this.workItemService = workItemService;
        this.authService = authService;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const isAuthenticated = await this.authService.isAuthenticated();
        if (!isAuthenticated) {
            return [new ConnectTreeItem()];
        }
        try {
            const workItems = await this.workItemService.getAssignedWorkItems();
            if (workItems.length === 0) {
                return [new EmptyTreeItem()];
            }
            return workItems.map((item) => new WorkItemTreeItem(item, vscode.TreeItemCollapsibleState.None));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load work items';
            vscode.window.showErrorMessage(message);
            return [new ConnectTreeItem()];
        }
    }
    getWorkItemId(item) {
        return item.workItem.id;
    }
}
exports.TasksTreeProvider = TasksTreeProvider;
//# sourceMappingURL=tasksTreeProvider.js.map