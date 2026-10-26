import { WorkItemTreeItem } from '../providers/tasksTreeProvider';

export interface WorkItemCommandRef {
  id: number;
  title?: string;
}

type OpenWorkItemArg =
  | number
  | WorkItemTreeItem
  | { workItem?: { id?: number; title?: string } }
  | undefined;

export function resolveWorkItemCommandRef(
  item?: OpenWorkItemArg,
  title?: string
): WorkItemCommandRef | undefined {
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
