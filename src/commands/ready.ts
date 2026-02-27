import { Command } from 'commander';
import type { Priority } from '../types/index.js';
import { getReadyIssues } from '../services/dependency-service.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueTable, outputResult } from '../utils/formatter.js';

export const readyCommand = new Command('ready')
  .description('Show issues ready to work on (no unresolved blockers)')
  .option('-p, --priority <n>', 'Filter by priority (0-3)')
  .option('--limit <n>', 'Maximum number of ready issues to return')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      let issues = await getReadyIssues();

      if (opts.priority !== undefined) {
        const priority = parseInt(opts.priority, 10) as Priority;
        issues = issues.filter((i) => i.priority === priority);
      }

      if (opts.limit !== undefined) {
        issues = issues.slice(0, parseInt(opts.limit, 10));
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
