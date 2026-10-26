export function parseWorkItemIdFromBranch(branch: string): number | undefined {
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

export function formatCommitMessage(workItemId: number, title: string): string {
  const trimmed = title.trim().replace(/\s+/g, ' ');
  return `AB#${workItemId} - ${trimmed}`;
}

export function formatBranchNameFromPattern(
  pattern: string,
  workItemId: number,
  title: string
): string {
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
