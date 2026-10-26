"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskBotService = void 0;
const wiqlPaths_1 = require("../utils/wiqlPaths");
const STOP_WORDS = new Set([
    'a',
    'an',
    'any',
    'about',
    'all',
    'and',
    'are',
    'backlog',
    'find',
    'for',
    'get',
    'in',
    'is',
    'it',
    'me',
    'my',
    'of',
    'on',
    'or',
    'related',
    'search',
    'show',
    'task',
    'tasks',
    'the',
    'to',
    'what',
    'where',
    'which',
    'with',
    'work',
    'item',
    'items',
]);
const STATE_INTENTS = [
    { pattern: /\bblocked\b/i, hint: 'blocked' },
    { pattern: /\bin[\s-]?progress\b/i, hint: 'progress' },
    { pattern: /\bon[\s-]?hold\b/i, hint: 'hold' },
    { pattern: /\b(done|completed|closed|resolved)\b/i, hint: 'done' },
    { pattern: /\bactive\b/i, hint: 'active' },
];
const BACKLOG_STATE_PATTERN = /backlog|new|to\s*do|proposed|ready|todo/i;
class TaskBotService {
    parseQuery(rawQuery, orgStates) {
        const trimmed = rawQuery.trim();
        const lower = trimmed.toLowerCase();
        const idMatch = trimmed.match(/(?:#|work\s*item\s*)?(\d{3,})\b/i);
        const workItemId = idMatch ? Number(idMatch[1]) : undefined;
        let scope = 'all';
        if (/\bbacklog\b/i.test(lower)) {
            scope = 'backlog';
        }
        else if (/\b(active|in\s*progress|open)\b/i.test(lower)) {
            scope = 'active';
        }
        else if (/\b(assigned\s+to\s+me|my\s+tasks?|mine)\b/i.test(lower)) {
            scope = 'mine';
        }
        const assignedToMe = scope === 'mine' || /\b(assigned\s+to\s+me|my\s+tasks?)\b/i.test(lower);
        const stateHints = STATE_INTENTS.filter((intent) => intent.pattern.test(lower)).map((intent) => intent.hint);
        const stateNames = orgStates
            .filter((state) => stateHints.some((hint) => state.name.toLowerCase().includes(hint)))
            .map((state) => state.name);
        const keywords = lower
            .replace(/[#@]\w+/g, ' ')
            .replace(/\b\d{3,}\b/g, ' ')
            .split(/[^a-z0-9]+/i)
            .map((word) => word.trim())
            .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
        const uniqueKeywords = [...new Set(keywords)].filter((word) => !stateHints.some((hint) => word.includes(hint) || hint.includes(word)));
        const backlogStateNames = orgStates
            .filter((state) => state.category === 'Proposed' || BACKLOG_STATE_PATTERN.test(state.name))
            .map((state) => state.name);
        return {
            keywords: uniqueKeywords,
            scope,
            workItemId,
            assignedToMe,
            backlogStateNames,
            stateNames,
        };
    }
    buildWiql(parsed, project) {
        const conditions = [];
        if (project?.trim()) {
            conditions.push(`[System.TeamProject] = '${(0, wiqlPaths_1.escapeWiqlLiteral)(project.trim())}'`);
        }
        if (parsed.assignedToMe) {
            conditions.push('[System.AssignedTo] = @Me');
        }
        if (parsed.scope === 'backlog' && parsed.backlogStateNames.length > 0) {
            const stateClause = parsed.backlogStateNames
                .map((state) => `[System.State] = '${(0, wiqlPaths_1.escapeWiqlLiteral)(state)}'`)
                .join('\n          OR ');
            conditions.push(`(${stateClause})`);
        }
        else if (parsed.stateNames.length > 0) {
            const stateClause = parsed.stateNames
                .map((state) => `[System.State] = '${(0, wiqlPaths_1.escapeWiqlLiteral)(state)}'`)
                .join('\n          OR ');
            conditions.push(`(${stateClause})`);
        }
        if (parsed.keywords.length > 0) {
            const textClause = parsed.keywords
                .flatMap((keyword) => [
                `[System.Title] Contains '${(0, wiqlPaths_1.escapeWiqlLiteral)(keyword)}'`,
                `[System.Description] Contains '${(0, wiqlPaths_1.escapeWiqlLiteral)(keyword)}'`,
                `[System.Tags] Contains '${(0, wiqlPaths_1.escapeWiqlLiteral)(keyword)}'`,
            ])
                .join('\n          OR ');
            conditions.push(`(${textClause})`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join('\n          AND ')}` : '';
        return `
      SELECT
        [System.Id],
        [System.Title],
        [System.State],
        [System.WorkItemType],
        [System.TeamProject],
        [System.IterationPath],
        [System.ChangedDate],
        [Microsoft.VSTS.Scheduling.DueDate],
        [Microsoft.VSTS.Scheduling.TargetDate]
      FROM WorkItems
      ${whereClause}
      ORDER BY [System.ChangedDate] DESC
    `.trim();
    }
    rankResults(items, parsed, rawQuery) {
        const lowerQuery = rawQuery.toLowerCase();
        const phrase = parsed.keywords.join(' ');
        return items
            .map((item) => {
            const titleLower = item.title.toLowerCase();
            const descLower = (item.descriptionPreview ?? '').toLowerCase();
            let score = 0;
            const reasons = [];
            if (phrase && titleLower.includes(phrase)) {
                score += 25;
                reasons.push('title phrase match');
            }
            for (const keyword of parsed.keywords) {
                if (titleLower.includes(keyword)) {
                    score += 12;
                    reasons.push(`title: ${keyword}`);
                }
                else if (descLower.includes(keyword)) {
                    score += 6;
                    reasons.push(`description: ${keyword}`);
                }
            }
            if (parsed.scope === 'backlog' && parsed.backlogStateNames.includes(item.state)) {
                score += 8;
                reasons.push('backlog state');
            }
            if (lowerQuery.includes(item.state.toLowerCase())) {
                score += 4;
            }
            if (score === 0) {
                score = 1;
                reasons.push('matched search');
            }
            return {
                ...item,
                relevanceScore: score,
                matchReason: reasons.length > 0 ? reasons.slice(0, 3).join(', ') : 'related match',
            };
        })
            .sort((a, b) => b.relevanceScore - a.relevanceScore || b.changedDate.localeCompare(a.changedDate));
    }
    formatReply(parsed, items, rawQuery) {
        if (parsed.workItemId && items.some((item) => item.id === parsed.workItemId)) {
            const direct = items.find((item) => item.id === parsed.workItemId);
            return `Found work item #${direct.id} — **${direct.title}** (${direct.state}, ${direct.workItemType}).`;
        }
        if (items.length === 0) {
            const scopeLabel = parsed.scope === 'backlog'
                ? ' on backlog'
                : parsed.scope === 'mine'
                    ? ' assigned to you'
                    : '';
            const keywordLabel = parsed.keywords.length > 0 ? ` matching "${parsed.keywords.join(' ')}"` : '';
            return `No tasks found${scopeLabel}${keywordLabel}. Try different keywords like "printer integration backlog".`;
        }
        const scopeLabel = parsed.scope === 'backlog'
            ? ' on backlog'
            : parsed.scope === 'mine'
                ? ' assigned to you'
                : parsed.scope === 'active'
                    ? ' in active states'
                    : '';
        const top = items[0];
        const headline = items.length === 1
            ? `Found 1 task${scopeLabel} for "${rawQuery.trim()}".`
            : `Found ${items.length} tasks${scopeLabel} for "${rawQuery.trim()}". Top match: #${top.id} ${top.title}.`;
        return headline;
    }
    buildSearchResponse(rawQuery, parsed, items, wiql) {
        return {
            reply: this.formatReply(parsed, items, rawQuery),
            items: items.slice(0, 25),
            parsed,
            wiql,
        };
    }
}
exports.TaskBotService = TaskBotService;
//# sourceMappingURL=taskBotService.js.map