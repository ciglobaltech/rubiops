/**
 * Query optimizer from the old Jessie agent.
 * WIQL stays valid Azure DevOps syntax: id-only SELECT, no T-SQL TOP.
 * Result caps are applied after Azure DevOps returns ids. WIQL itself stays a plain SELECT … FROM.
 */

export const SEARCH_QUERY_TOP = 100;
export const ASSIGNED_QUERY_TOP = 200;
export const DASHBOARD_QUERY_TOP = 500;

export function optimizeWiql(wiql: string): string {
  return wiql.trim().replace(/^select\s+top\s+\d+\s+/i, 'SELECT ');
}
