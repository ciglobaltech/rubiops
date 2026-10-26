"use strict";
/**
 * Query optimizer from the old Jessie agent.
 * WIQL stays valid Azure DevOps syntax: id-only SELECT, no T-SQL TOP.
 * Result caps are applied after Azure DevOps returns ids. WIQL itself stays a plain SELECT … FROM.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DASHBOARD_QUERY_TOP = exports.ASSIGNED_QUERY_TOP = exports.SEARCH_QUERY_TOP = void 0;
exports.optimizeWiql = optimizeWiql;
exports.SEARCH_QUERY_TOP = 100;
exports.ASSIGNED_QUERY_TOP = 200;
exports.DASHBOARD_QUERY_TOP = 500;
function optimizeWiql(wiql) {
    return wiql.trim().replace(/^select\s+top\s+\d+\s+/i, 'SELECT ');
}
//# sourceMappingURL=queryOptimizer.js.map