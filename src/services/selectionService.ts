export class SelectionService {
  private selectedWorkItemId?: number;
  private selectedWorkItemTitle?: string;

  select(id: number, title: string): void {
    this.selectedWorkItemId = id;
    this.selectedWorkItemTitle = title;
  }

  clear(): void {
    this.selectedWorkItemId = undefined;
    this.selectedWorkItemTitle = undefined;
  }

  getSelected(): { id: number; title: string } | undefined {
    if (!this.selectedWorkItemId) {
      return undefined;
    }
    return {
      id: this.selectedWorkItemId,
      title: this.selectedWorkItemTitle ?? `#${this.selectedWorkItemId}`,
    };
  }
}
