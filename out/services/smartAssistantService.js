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
exports.SmartAssistantService = void 0;
const vscode = __importStar(require("vscode"));
const gitWorkItem_1 = require("../utils/gitWorkItem");
const workItemStatus_1 = require("../utils/workItemStatus");
const TOOL_LABEL = 'RubiOps';
function getConfigTag(key, fallback) {
    return (vscode.workspace.getConfiguration('devopsQuickUpdate').get(key, fallback)?.trim() ||
        fallback);
}
class SmartAssistantService {
    buildInsights(data, gitContext) {
        const recommended = this.recommendNextTask(data);
        const alerts = this.buildAlerts(data, gitContext, recommended);
        const standupSummary = this.generateStandupSummary(data, gitContext, recommended);
        const focusMismatch = this.detectFocusMismatch(data, gitContext, recommended);
        const branchItem = gitContext.linkedWorkItemId
            ? this.findWorkItem(data, gitContext.linkedWorkItemId)
            : undefined;
        return {
            recommended,
            gitContext,
            alerts,
            standupSummary,
            commitMessage: recommended
                ? (0, gitWorkItem_1.formatCommitMessage)(recommended.workItem.id, recommended.workItem.title)
                : branchItem
                    ? (0, gitWorkItem_1.formatCommitMessage)(branchItem.id, branchItem.title)
                    : undefined,
            focusMismatch,
        };
    }
    recommendNextTask(data) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const scored = data.allPending
            .map((item) => this.scoreTask(item, today))
            .filter((entry) => entry !== undefined)
            .sort((a, b) => b.score - a.score);
        return scored[0];
    }
    generateStandupSummary(data, gitContext, recommended) {
        const date = new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
        });
        const yesterday = data.dailyPlan.yesterday;
        const todayPlan = data.dailyPlan.today;
        const blockers = data.allPending.filter((item) => (0, workItemStatus_1.isBlockedState)(item.state));
        const inProgress = data.inProgress;
        const doneToday = data.allClosedToday;
        const todayOpen = todayPlan.actionItems.filter((item) => ['incomplete', 'overdue', 'in-progress', 'planned'].includes(item.timeStatus));
        const yesterdayLines = yesterday.completedCount > 0
            ? yesterday.items
                .filter((item) => item.timeStatus === 'completed' || item.timeStatus === 'done-yesterday')
                .map((item) => `  • #${item.id} ${item.title} (${item.state})`)
            : ['  • No completed items logged'];
        const doneTodayLines = doneToday.length > 0
            ? doneToday.map((item) => `  • #${item.id} ${item.title} (${item.state})`)
            : ['  • No tasks closed yet today'];
        const todayLines = todayOpen.length > 0
            ? todayOpen.map((item) => {
                const due = item.dueDate ? ` · due ${item.dueDate.slice(0, 10)}` : '';
                return `  • #${item.id} ${item.title} (${item.state})${due}`;
            })
            : ['  • No open items for today — review backlog'];
        const blockerLines = blockers.length > 0
            ? blockers.map((item) => `  • #${item.id} ${item.title}`)
            : ['  • None'];
        const progressLines = inProgress.length > 0
            ? inProgress.map((item) => `  • #${item.id} ${item.title}`)
            : ['  • None active'];
        const gitLine = gitContext.branchName
            ? `Current branch: ${gitContext.branchName}${gitContext.linkedWorkItemId ? ` → #${gitContext.linkedWorkItemId}` : ''}`
            : 'Current branch: not detected';
        const nextLine = recommended
            ? `AI recommends next: #${recommended.workItem.id} ${recommended.workItem.title} — ${recommended.reason}`
            : 'AI recommends: review your dashboard backlog';
        return [
            `Daily Standup — ${date}`,
            `Powered by ${TOOL_LABEL}`,
            '',
            '✅ Yesterday',
            ...yesterdayLines,
            '',
            '✅ Done Today',
            ...doneTodayLines,
            '',
            '🔨 Today (Open)',
            ...todayLines,
            '',
            '🚧 Blockers',
            ...blockerLines,
            '',
            '📋 In Progress',
            ...progressLines,
            '',
            '🧠 Smart Context',
            `  • ${gitLine}`,
            `  • ${nextLine}`,
            `  • ${data.closedTodayCount} done today · ${data.overdueCount} overdue · ${data.dueTodayCount} due today · ${data.staleCount} stale`,
        ].join('\n');
    }
    scoreTask(item, today) {
        if ((0, workItemStatus_1.isBlockedState)(item.state) || (0, workItemStatus_1.isHoldState)(item.state)) {
            return undefined;
        }
        if ((0, workItemStatus_1.isResolvedCategory)(item.stateCategory)) {
            return undefined;
        }
        let score = 0;
        const reasons = [];
        if (item.dueDate) {
            const due = new Date(item.dueDate);
            due.setHours(0, 0, 0, 0);
            const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
            if (diffDays < 0) {
                score += 120 + Math.min(30, Math.abs(diffDays) * 5);
                reasons.push(`${Math.abs(diffDays)} day(s) overdue`);
            }
            else if (diffDays === 0) {
                score += 90;
                reasons.push('due today');
            }
            else if (diffDays <= 3) {
                score += 40;
                reasons.push(`due in ${diffDays} day(s)`);
            }
        }
        const priority = Number(item.priority);
        if (!Number.isNaN(priority)) {
            if (priority === 1) {
                score += 60;
                reasons.push('priority 1');
            }
            else if (priority === 2) {
                score += 40;
                reasons.push('priority 2');
            }
            else if (priority === 3) {
                score += 15;
            }
        }
        if (item.stateCategory === 'InProgress') {
            score += 35;
            reasons.push('already in progress');
        }
        const isBug = item.workItemType.toLowerCase() === 'bug';
        const todayTag = getConfigTag('bugWatch.todayAssignedTag', 'TodayAssigned');
        const hasTodayAssigned = (item.tags ?? []).some((tag) => tag.toLowerCase() === todayTag.toLowerCase());
        if (isBug && hasTodayAssigned) {
            score += 100;
            reasons.push('TodayAssigned bug');
        }
        else if (isBug) {
            score += 50;
            reasons.push('bug');
        }
        else if (hasTodayAssigned) {
            score += 70;
            reasons.push('TodayAssigned');
        }
        const brokenTag = getConfigTag('brokenVerify.tag', 'Broken');
        if ((item.tags ?? []).some((tag) => tag.toLowerCase() === brokenTag.toLowerCase())) {
            score += 40;
            reasons.push('Broken tag');
        }
        const changed = new Date(item.changedDate);
        const staleDays = Math.floor((today.getTime() - changed.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
        if (staleDays >= 7) {
            score += 20;
            reasons.push('stale 7+ days');
        }
        if (score <= 0) {
            score = 10;
            reasons.push('open backlog item');
        }
        return {
            workItem: item,
            score,
            reason: reasons.slice(0, 3).join(' · '),
        };
    }
    buildAlerts(data, gitContext, recommended) {
        const alerts = [];
        if (data.closedTodayCount > 0) {
            alerts.push({
                level: 'info',
                message: `${data.closedTodayCount} task(s) completed today — click to view all`,
                filterKey: 'today-done',
            });
        }
        if (data.overdueCount > 0) {
            alerts.push({
                level: 'action',
                message: `${data.overdueCount} overdue task(s) need immediate attention — click to view all`,
                filterKey: 'overdue',
            });
        }
        if (data.blockedCount > 0) {
            alerts.push({
                level: 'warning',
                message: `${data.blockedCount} blocked task(s) — click to view all`,
                filterKey: 'blocked',
            });
        }
        if (data.staleCount > 0) {
            alerts.push({
                level: 'info',
                message: `${data.staleCount} stale task(s) with no updates in 7+ days — click to view all`,
                filterKey: 'stale',
            });
        }
        const todayTag = getConfigTag('bugWatch.todayAssignedTag', 'TodayAssigned');
        const brokenTag = getConfigTag('brokenVerify.tag', 'Broken');
        const todayBugs = data.allPending.filter((item) => item.workItemType.toLowerCase() === 'bug' &&
            item.tags.some((t) => t.toLowerCase() === todayTag.toLowerCase()));
        if (todayBugs.length > 0) {
            alerts.push({
                level: 'action',
                message: `${todayBugs.length} TodayAssigned bug(s) on your plan — open #${todayBugs[0].id}`,
                workItemId: todayBugs[0].id,
            });
        }
        const brokenItems = data.allPending.filter((item) => item.tags.some((t) => t.toLowerCase() === brokenTag.toLowerCase()));
        if (brokenItems.length > 0) {
            alerts.push({
                level: 'warning',
                message: `${brokenItems.length} Broken-tagged item(s) — auto smart test uses configured test environment`,
                workItemId: brokenItems[0].id,
            });
        }
        if (gitContext.linkedWorkItemId && recommended) {
            const branchItem = this.findWorkItem(data, gitContext.linkedWorkItemId);
            if (branchItem &&
                recommended.workItem.id !== gitContext.linkedWorkItemId &&
                recommended.score >= 90) {
                alerts.push({
                    level: 'warning',
                    message: `Branch links to #${gitContext.linkedWorkItemId} but AI recommends #${recommended.workItem.id} (${recommended.reason})`,
                    workItemId: recommended.workItem.id,
                });
            }
        }
        if (gitContext.isRepo && !gitContext.branchName) {
            alerts.push({
                level: 'info',
                message: 'Detached HEAD — checkout a branch before starting new work',
            });
        }
        if (data.inProgressCount > 3) {
            alerts.push({
                level: 'info',
                message: `${data.inProgressCount} items in progress — click to view all`,
                filterKey: 'in-progress',
            });
        }
        return alerts.slice(0, 5);
    }
    detectFocusMismatch(data, gitContext, recommended) {
        if (!gitContext.linkedWorkItemId || !recommended) {
            return undefined;
        }
        if (gitContext.linkedWorkItemId === recommended.workItem.id) {
            return undefined;
        }
        const branchItem = this.findWorkItem(data, gitContext.linkedWorkItemId);
        if (!branchItem) {
            return undefined;
        }
        if (recommended.score < 80) {
            return undefined;
        }
        return {
            branchWorkItemId: gitContext.linkedWorkItemId,
            suggestedWorkItemId: recommended.workItem.id,
            message: `Your branch is for #${gitContext.linkedWorkItemId} but #${recommended.workItem.id} is higher priority (${recommended.reason})`,
        };
    }
    findWorkItem(data, id) {
        return data.allPending.find((item) => item.id === id);
    }
}
exports.SmartAssistantService = SmartAssistantService;
//# sourceMappingURL=smartAssistantService.js.map