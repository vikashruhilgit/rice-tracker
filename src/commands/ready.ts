import { Command } from 'commander';
import type { Priority } from '../types/index.js';
import { getReadyIssues } from '../services/dependency-service.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueTable, outputResult } from '../utils/formatter.js';

function parsePosInt(val: string, flag: string): number {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 0) {
    console.error(`Error: ${flag} must be a non-negative integer`);
    process.exit(1);
  }
  return n;
}

export const readyCommand = new Command('ready')
  .description('Show issues ready to work on (no unresolved blockers)')
  .option('-p, --priority <n>', 'Filter by priority (0-3)')
  .option('--limit <n>', 'Maximum number of ready issues to return')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const limitCount = opts.limit !== undefined ? parsePosInt(opts.limit, '--limit') : undefined;
      let issues = await getReadyIssues(limitCount);

      if (opts.priority !== undefined) {
        const priority = parseInt(opts.priority, 10) as Priority;
        issues = issues.filter((i) => i.priority === priority);
      }

      if (opts.json) {
        outputResult(issues, true);
      } else {
        if (issues.length === 0) {
          console.log('No ready issues found.');
        } else {
          const tz = getTimezone();
          console.log(formatIssueTable(issues, tz));
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
