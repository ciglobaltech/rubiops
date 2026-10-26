"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeWiqlPath = normalizeWiqlPath;
exports.escapeWiqlLiteral = escapeWiqlLiteral;
exports.escapeWiqlPath = escapeWiqlPath;
exports.inferProjectFromPath = inferProjectFromPath;
exports.resolveProjectForFilter = resolveProjectForFilter;
function normalizeWiqlPath(path) {
    return path.trim().replace(/^\\+/, '').replace(/\//g, '\\');
}
function escapeWiqlLiteral(value) {
    return value.trim().replace(/'/g, "''");
}
function escapeWiqlPath(path) {
    return escapeWiqlLiteral(normalizeWiqlPath(path));
}
function inferProjectFromPath(path) {
    if (!path?.trim()) {
        return undefined;
    }
    const normalized = normalizeWiqlPath(path);
    const segments = normalized.split('\\').filter(Boolean);
    return segments[0];
}
function resolveProjectForFilter(filter) {
    return (filter.project?.trim() ||
        inferProjectFromPath(filter.areaPath) ||
        inferProjectFromPath(filter.iterationPath) ||
        undefined);
}
//# sourceMappingURL=wiqlPaths.js.map