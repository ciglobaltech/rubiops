export function normalizeWiqlPath(path: string): string {
  return path.trim().replace(/^\\+/, '').replace(/\//g, '\\');
}

export function escapeWiqlLiteral(value: string): string {
  return value.trim().replace(/'/g, "''");
}

export function escapeWiqlPath(path: string): string {
  return escapeWiqlLiteral(normalizeWiqlPath(path));
}

export function inferProjectFromPath(path?: string): string | undefined {
  if (!path?.trim()) {
    return undefined;
  }
  const normalized = normalizeWiqlPath(path);
  const segments = normalized.split('\\').filter(Boolean);
  return segments[0];
}

export function resolveProjectForFilter(filter: {
  project?: string;
  areaPath?: string;
  iterationPath?: string;
}): string | undefined {
  return (
    filter.project?.trim() ||
    inferProjectFromPath(filter.areaPath) ||
    inferProjectFromPath(filter.iterationPath) ||
    undefined
  );
}
