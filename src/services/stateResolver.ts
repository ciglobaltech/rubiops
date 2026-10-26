import { WorkItemTypeState } from '../models/workItemState';

const INACTIVE_CATEGORIES = new Set(['Completed', 'Removed']);

export class StateResolver {
  private readonly cache = new Map<string, WorkItemTypeState[]>();

  getCacheKey(project: string, workItemType: string): string {
    return `${project}:${workItemType}`;
  }

  setCachedStates(project: string, workItemType: string, states: WorkItemTypeState[]): void {
    this.cache.set(this.getCacheKey(project, workItemType), states);
  }

  getCachedStates(project: string, workItemType: string): WorkItemTypeState[] | undefined {
    return this.cache.get(this.getCacheKey(project, workItemType));
  }

  clearCache(): void {
    this.cache.clear();
  }

  isActiveState(orgStates: WorkItemTypeState[], stateName: string): boolean {
    const state = orgStates.find((entry) => entry.name === stateName);
    if (!state) {
      return true;
    }
    return !INACTIVE_CATEGORIES.has(state.category);
  }
}
