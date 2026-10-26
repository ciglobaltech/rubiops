"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWorkItemCommandRef = resolveWorkItemCommandRef;
function resolveWorkItemCommandRef(item, title) {
    if (typeof item === 'number') {
        return { id: item, title };
    }
    if (item && typeof item === 'object' && 'workItem' in item && item.workItem?.id) {
        return {
            id: item.workItem.id,
            title: item.workItem.title,
        };
    }
    return undefined;
}
//# sourceMappingURL=workItemCommandArgs.js.map