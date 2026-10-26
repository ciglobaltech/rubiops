"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOfDay = startOfDay;
exports.endOfDay = endOfDay;
exports.addDays = addDays;
exports.parseAdoDate = parseAdoDate;
exports.isWithinDay = isWithinDay;
exports.formatDisplayDate = formatDisplayDate;
exports.isBeforeDay = isBeforeDay;
exports.daysSince = daysSince;
exports.formatDayLabel = formatDayLabel;
function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}
function endOfDay(date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
}
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
function parseAdoDate(value) {
    if (!value) {
        return undefined;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
function isWithinDay(value, day) {
    if (!value) {
        return false;
    }
    const start = startOfDay(day);
    const end = endOfDay(day);
    return value >= start && value <= end;
}
function formatDisplayDate(date) {
    return date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}
function isBeforeDay(value, day) {
    if (!value) {
        return false;
    }
    return value < startOfDay(day);
}
function daysSince(value) {
    if (!value) {
        return undefined;
    }
    const diff = startOfDay(new Date()).getTime() - startOfDay(value).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}
function formatDayLabel(date) {
    return date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    });
}
//# sourceMappingURL=dates.js.map