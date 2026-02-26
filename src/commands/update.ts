import { Command } from 'commander';
import type { Issue, IssueType, IssueStatus, Priority } from '../types/index.js';
import { updateIssue } from '../services/issue-service.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueDetail, outputResult } from '../utils/formatter.js';

export const updateCommand = new Command('update')
  .description('Update an issue')
  .argument('<id>', 'Issue ID')
  .option('-t, --title <title>', 'New title')
  .option('-d, --description <text>', 'New description')
  .option('--type <type>', 'New type (task|bug|epic|message)')
  .option('-p, --priority <n>', 'New priority (0-3)')
  .option('-s, --status <status>', 'New status (open|in_progress|closed)')
  .option('-a, --assignee <user>', 'New assignee')
  .option('--defer-until <date>', 'Set defer-until date (ISO 8601 or YYYY-MM-DD)')
  .option('--due <date>', 'Set due date (ISO 8601 or YYYY-MM-DD)')
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts) => {
    try {
      const updates: Partial<Pick<Issue, 'title' | 'description' | 'type' | 'priority' | 'status' | 'assignee' | 'deferUntil' | 'dueAt'>> = {};

      if (opts.title) updates.title = opts.title;
      if (opts.description) updates.description = opts.description;
      if (opts.type) updates.type = opts.type as IssueType;
      if (opts.priority !== undefined) updates.priority = parseInt(opts.priority, 10) as Priority;
      if (opts.status) updates.status = opts.status as IssueStatus;
      if (opts.assignee) updates.assignee = opts.assignee;
      if (opts.deferUntil !== undefined) {
        const d = new Date(opts.deferUntil as string);
        if (isNaN(d.getTime())) { console.error('Error: Invalid --defer-until date'); process.exit(1); }
        updates.deferUntil = d;
      }
      if (opts.due !== undefined) {
        const d = new Date(opts.due as string);
        if (isNaN(d.getTime())) { console.error('Error: Invalid --due date'); process.exit(1); }
        updates.dueAt = d;
      }

      if (Object.keys(updates).length === 0) {
        console.error('Error: No updates provided. Use -t, -d, --type, -p, -s, or -a flags.');
        process.exit(1);
      }

      const issue = await updateIssue(id, updates);

      if (opts.json) {
        outputResult(issue, true);
      } else {
        const tz = getTimezone();
        console.log(formatIssueDetail(issue, tz));
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
