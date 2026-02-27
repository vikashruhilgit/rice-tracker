import { Command } from 'commander';
import { getDocs, query, where } from 'firebase/firestore';
import type { IssueType, Priority } from '../types/index.js';
import { createIssue } from '../services/issue-service.js';
import { addChildToEpic } from '../services/epic-service.js';
import { validateIssue } from '../models/issue.js';
import { labelConverter } from '../models/label.js';
import { labelsCollection } from '../firebase/collections.js';
import { getCurrentProjectId } from '../utils/config.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueDetail, outputResult } from '../utils/formatter.js';

async function resolveLabelNamesToIds(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const projectId = getCurrentProjectId();
  const colRef = labelsCollection(projectId);
  const labelIds: string[] = [];
  for (const name of names) {
    const q = query(colRef, where('name', '==', name.trim()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const label = labelConverter.fromFirestore(snap.docs[0]);
      labelIds.push(label.labelId);
    }
  }
  return labelIds;
}

export const createCommand = new Command('create')
  .description('Create a new issue')
  .argument('<title>', 'Issue title')
  .option('-d, --description <text>', 'Issue description')
  .option('-t, --type <type>', 'Issue type (task|bug|epic|message)', 'task')
  .option('-p, --priority <n>', 'Priority (0=critical, 3=low)', '2')
  .option('-a, --assignee <user>', 'Assignee')
  .option('-l, --labels <labels>', 'Comma-separated labels')
  .option('--defer-until <date>', 'Defer until date (ISO 8601 or YYYY-MM-DD)')
  .option('--due <date>', 'Due date (ISO 8601 or YYYY-MM-DD)')
  .option('--parent <epicId>', 'Attach to parent epic')
  .option('--json', 'Output as JSON', false)
  .action(async (title: string, opts) => {
    try {
      const priority = parseInt(opts.priority, 10) as Priority;
      const type = opts.type as IssueType;
      const labels = opts.labels ? (opts.labels as string).split(',').map((l: string) => l.trim()) : undefined;
      const deferUntil = opts.deferUntil ? new Date(opts.deferUntil as string) : undefined;
      const dueAt = opts.due ? new Date(opts.due as string) : undefined;

      if (deferUntil && isNaN(deferUntil.getTime())) {
        console.error('Error: Invalid --defer-until date');
        process.exit(1);
      }
      if (dueAt && isNaN(dueAt.getTime())) {
        console.error('Error: Invalid --due date');
        process.exit(1);
      }

      const errors = validateIssue({ title, priority, type });
      if (errors.length > 0) {
        console.error('Validation errors:', errors.join(', '));
        process.exit(1);
      }

      const labelIds = labels ? await resolveLabelNamesToIds(labels) : undefined;

      let issue = await createIssue({
        title,
        description: opts.description,
        type,
        priority,
        assignee: opts.assignee,
        labels,
        labelIds,
        deferUntil,
        dueAt,
      });

      if (opts.parent) {
        issue = await addChildToEpic(opts.parent as string, issue.issueId);
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
