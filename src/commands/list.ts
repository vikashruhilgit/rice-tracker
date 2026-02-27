import { Command } from 'commander';
import { getDocs, query, where } from 'firebase/firestore';
import type { IssueStatus, IssueType, Priority } from '../types/index.js';
import { listIssues, paginatedListIssues } from '../services/issue-service.js';
import { labelConverter } from '../models/label.js';
import { labelsCollection } from '../firebase/collections.js';
import { getCurrentProjectId, getTimezone } from '../utils/config.js';
import { formatIssueTable, outputResult } from '../utils/formatter.js';

async function resolveLabelNameToId(name: string): Promise<string | null> {
  const projectId = getCurrentProjectId();
  const colRef = labelsCollection(projectId);
  const q = query(colRef, where('name', '==', name));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return labelConverter.fromFirestore(snap.docs[0]).labelId;
}

export const listCommand = new Command('list')
  .description('List issues')
  .option('-s, --status <status>', 'Filter by status (open|in_progress|closed|archived)')
  .option('-p, --priority <n>', 'Filter by priority (0-3)')
  .option('-a, --assignee <user>', 'Filter by assignee')
  .option('-t, --type <type>', 'Filter by type (task|bug|epic|message)')
  .option('-l, --label <label>', 'Filter by label')
  .option('--overdue', 'Show only overdue issues (dueAt < now and not closed)', false)
  .option('--limit <n>', 'Maximum number of issues to return')
  .option('--offset <n>', 'Number of issues to skip (use with --limit)', '0')
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
      if (opts.label) {
        const labelId = await resolveLabelNameToId(opts.label);
        if (labelId) {
          filters.labelIds = [labelId];
        } else {
          filters.labels = [opts.label]; // fallback to name-based for legacy data
        }
      }
      if (opts.overdue) filters.overdue = true;

      const hasPagination = opts.limit !== undefined;

      if (hasPagination) {
        const lim = parseInt(opts.limit, 10);
        const offset = parseInt(opts.offset, 10);
        const result = await paginatedListIssues(filters, { limit: lim, offset });
        if (opts.json) {
          outputResult(result, true);
        } else {
          if (result.items.length === 0) {
            console.log('No issues found.');
          } else {
            const tz = getTimezone();
            console.log(formatIssueTable(result.items, tz));
            console.log(`\nShowing ${result.items.length} of ${result.total} issues${result.hasMore ? ' (more available)' : ''}`);
          }
        }
      } else {
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
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
