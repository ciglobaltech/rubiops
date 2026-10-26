import { WorkItem } from '../models/workItem';

export interface BugWorkPlan {
  workItemId: number;
  title: string;
  plainText: string;
}

export class BugWorkPlanService {
  buildPlan(workItem: WorkItem): BugWorkPlan {
    const description = stripHtml(workItem.description);
    const acceptance = stripHtml(workItem.acceptanceCriteria ?? '');
    const tags = workItem.tags.join(', ') || 'none';

    const symptomHint =
      firstMeaningfulLine(description) ||
      firstMeaningfulLine(workItem.title) ||
      'Review reported failure on preprod';

    const lines = [
      `Bug: #${workItem.id} ${workItem.title}`,
      `State: ${workItem.state} · Priority: ${workItem.priority} · Tags: ${tags}`,
      '',
      '1) Reproduce',
      `   - Open prod/preprod and confirm: ${symptomHint}`,
      '   - Capture exact steps, browser, and screenshots if still failing',
      '',
      '2) Narrow cause',
      '   - Compare expected vs actual from description / acceptance',
      acceptance ? `   - Acceptance notes: ${truncate(acceptance, 240)}` : '   - Check related API / UI / recent commits',
      '',
      '3) Fix approach',
      '   - Identify owning module from title/area path',
      `   - Area: ${workItem.areaPath || 'N/A'} · Iteration: ${workItem.iterationPath || 'N/A'}`,
      '',
      '4) Verify',
      '   - Re-test on configured QA/Preprod environment after fix',
      '   - Confirm no regression on related flows',
      '',
      '5) ADO notes',
      '   - Update state when work starts / completes',
      '   - Keep RubiOps verify block current',
      '',
      `Generated: ${new Date().toISOString()}`,
    ];

    return {
      workItemId: workItem.id,
      title: workItem.title,
      plainText: lines.join('\n'),
    };
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function firstMeaningfulLine(text: string): string | undefined {
  const line = text
    .split(/\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 8);
  return line ? truncate(line, 160) : undefined;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
