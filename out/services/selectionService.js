"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectionService = void 0;
class SelectionService {
    selectedWorkItemId;
    selectedWorkItemTitle;
    select(id, title) {
        this.selectedWorkItemId = id;
        this.selectedWorkItemTitle = title;
    }
    clear() {
        this.selectedWorkItemId = undefined;
        this.selectedWorkItemTitle = undefined;
    }
    getSelected() {
        if (!this.selectedWorkItemId) {
            return undefined;
        }
        return {
            id: this.selectedWorkItemId,
            title: this.selectedWorkItemTitle ?? `#${this.selectedWorkItemId}`,
        };
    }
}
exports.SelectionService = SelectionService;
//# sourceMappingURL=selectionService.js.map