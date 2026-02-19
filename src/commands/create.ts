import { Command } from 'commander';
import type { IssueType, Priority } from '../types/index.js';
import { createIssue } from '../services/issue-service.js';
import { validateIssue } from '../models/issue.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueDetail, outputResult } from '../utils/formatter.js';

export const createCommand = new Command('create')
  .description('Create a new issue')
  .argument('<title>', 'Issue title')
  .option('-d, --description <text>', 'Issue description')
  .option('-t, --type <type>', 'Issue type (task|bug|epic|message)', 'task')
  .option('-p, --priority <n>', 'Priority (0=critical, 3=low)', '2')
  .option('-a, --assignee <user>', 'Assignee')
  .option('-l, --labels <labels>', 'Comma-separated labels')
  .option('--json', 'Output as JSON', false)
  .action(async (title: string, opts) => {
    try {
      const priority = parseInt(opts.priority, 10) as Priority;
      const type = opts.type as IssueType;
      const labels = opts.labels ? (opts.labels as string).split(',').map((l: string) => l.trim()) : undefined;

      const errors = validateIssue({ title, priority, type });
      if (errors.length > 0) {
        console.error('Validation errors:', errors.join(', '));
        process.exit(1);
      }

      const issue = await createIssue({
        title,
        description: opts.description,
        type,
        priority,
        assignee: opts.assignee,
        labels,
      });

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
