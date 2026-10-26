export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function parseAdoDate(value: unknown): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function isWithinDay(value: Date | undefined, day: Date): boolean {
  if (!value) {
    return false;
  }
  const start = startOfDay(day);
  const end = endOfDay(day);
  return value >= start && value <= end;
}

export function formatDisplayDate(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function isBeforeDay(value: Date | undefined, day: Date): boolean {
  if (!value) {
    return false;
  }
  return value < startOfDay(day);
}

export function daysSince(value: Date | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const diff = startOfDay(new Date()).getTime() - startOfDay(value).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}
