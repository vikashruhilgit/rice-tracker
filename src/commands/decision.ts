import { Command } from 'commander';
import type { Priority } from '../types/index.js';
import { createIssue, getIssue, listIssues } from '../services/issue-service.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueDetail, formatIssueTable, outputResult } from '../utils/formatter.js';

const decisionCreate = new Command('create')
  .description('Create a new architectural decision record')
  .argument('<title>', 'Decision title')
  .option('-d, --description <text>', 'Decision description / rationale')
  .option('-p, --priority <n>', 'Priority (0=critical, 3=low)', '2')
  .option('-a, --assignee <user>', 'Assignee')
  .option('--json', 'Output as JSON', false)
  .action(async (title: string, opts) => {
    try {
      const priority = parseInt(opts.priority, 10) as Priority;

      const issue = await createIssue({
        title,
        description: opts.description,
        type: 'decision',
        priority,
        assignee: opts.assignee,
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

const decisionList = new Command('list')
  .description('List all architectural decision records')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const decisions = await listIssues({ type: 'decision' });

      if (opts.json) {
        outputResult(decisions, true);
      } else {
        if (decisions.length === 0) {
          console.log('No decisions found.');
        } else {
          const tz = getTimezone();
          console.log(formatIssueTable(decisions, tz));
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const decisionShow = new Command('show')
  .description('Show a decision record in detail')
  .argument('<id>', 'Decision issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts) => {
    try {
      const issue = await getIssue(id);

      if (issue.type !== 'decision') {
        console.error(`Error: Issue ${id} is not a decision (type: ${issue.type})`);
        process.exit(1);
      }

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

export const decisionCommand = new Command('decision')
  .description('Manage architectural decision records')
  .addCommand(decisionCreate)
  .addCommand(decisionList)
  .addCommand(decisionShow);
