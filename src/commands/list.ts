import { Command } from 'commander';
import type { IssueStatus, IssueType, Priority } from '../types/index.js';
import { listIssues } from '../services/issue-service.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueTable, outputResult } from '../utils/formatter.js';

export const listCommand = new Command('list')
  .description('List issues')
  .option('-s, --status <status>', 'Filter by status (open|in_progress|closed|archived)')
  .option('-p, --priority <n>', 'Filter by priority (0-3)')
  .option('-a, --assignee <user>', 'Filter by assignee')
  .option('-t, --type <type>', 'Filter by type (task|bug|epic|message)')
  .option('-l, --label <label>', 'Filter by label')
  .option('--overdue', 'Show only overdue issues (dueAt < now and not closed)', false)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const filters: {
        status?: IssueStatus;
        priority?: Priority;
        assignee?: string;
        type?: IssueType;
        labels?: string[];
        overdue?: boolean;
      } = {};

      if (opts.status) filters.status = opts.status as IssueStatus;
      if (opts.priority !== undefined) filters.priority = parseInt(opts.priority, 10) as Priority;
      if (opts.assignee) filters.assignee = opts.assignee;
      if (opts.type) filters.type = opts.type as IssueType;
      if (opts.label) filters.labels = [opts.label];
      if (opts.overdue) filters.overdue = true;

      const issues = await listIssues(filters);

      if (opts.json) {
        outputResult(issues, true);
      } else {
        if (issues.length === 0) {
          console.log('No issues found.');
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
