"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUIRED_PAT_SCOPES = void 0;
exports.formatPatScopeHint = formatPatScopeHint;
exports.isSchedulingFieldError = isSchedulingFieldError;
exports.REQUIRED_PAT_SCOPES = [
    'Work Items — Read & write',
    'Code — Read & write (for Auto Code Fix push / PR)',
    'Project and Team — Read',
    'Member Entitlement Management — Read (for assignee list)',
];
function formatPatScopeHint(action) {
    return (`Failed to ${action}. Check your Personal Access Token:\n` +
        exports.REQUIRED_PAT_SCOPES.map((scope) => `• ${scope}`).join('\n'));
}
function isSchedulingFieldError(message) {
    const lower = message.toLowerCase();
    return (lower.includes('completedwork') ||
        lower.includes('remainingwork') ||
        lower.includes('scheduling') ||
        lower.includes('field status not valid') ||
        lower.includes('cannot find field'));
}
//# sourceMappingURL=patScopes.js.map