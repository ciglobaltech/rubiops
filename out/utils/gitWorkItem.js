"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWorkItemIdFromBranch = parseWorkItemIdFromBranch;
exports.formatCommitMessage = formatCommitMessage;
exports.formatBranchNameFromPattern = formatBranchNameFromPattern;
function parseWorkItemIdFromBranch(branch) {
    const patterns = [
        /(?:^|\/)(\d{4,})-/,
        /(?:^|\/)(\d{4,})(?:\/|$)/,
        /AB[#]?(\d+)/i,
        /#(\d{4,})/,
        /wi-(\d+)/i,
        /workitem[_-]?(\d+)/i,
    ];
    for (const pattern of patterns) {
        const match = branch.match(pattern);
        if (match) {
            const id = Number.parseInt(match[1], 10);
            if (!Number.isNaN(id) && id > 0) {
                return id;
            }
        }
    }
    return undefined;
}
function formatCommitMessage(workItemId, title) {
    const trimmed = title.trim().replace(/\s+/g, ' ');
    return `AB#${workItemId} - ${trimmed}`;
}
function formatBranchNameFromPattern(pattern, workItemId, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
    return pattern
        .replace('{id}', String(workItemId))
        .replace('{title}', slug || 'task')
        .replace(/[^a-zA-Z0-9/._-]/g, '-')
        .replace(/--+/g, '-');
}
//# sourceMappingURL=gitWorkItem.js.map