"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateResolver = void 0;
const INACTIVE_CATEGORIES = new Set(['Completed', 'Removed']);
class StateResolver {
    cache = new Map();
    getCacheKey(project, workItemType) {
        return `${project}:${workItemType}`;
    }
    setCachedStates(project, workItemType, states) {
        this.cache.set(this.getCacheKey(project, workItemType), states);
    }
    getCachedStates(project, workItemType) {
        return this.cache.get(this.getCacheKey(project, workItemType));
    }
    clearCache() {
        this.cache.clear();
    }
    isActiveState(orgStates, stateName) {
        const state = orgStates.find((entry) => entry.name === stateName);
        if (!state) {
            return true;
        }
        return !INACTIVE_CATEGORIES.has(state.category);
    }
}
exports.StateResolver = StateResolver;
//# sourceMappingURL=stateResolver.js.map