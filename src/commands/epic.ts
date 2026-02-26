import { Command } from 'commander';
import type { Priority } from '../types/index.js';
import { createIssue, getIssue } from '../services/issue-service.js';
import { getEpicChildren, addChildToEpic } from '../services/epic-service.js';
import { isEpic } from '../models/epic.js';
import { listIssues } from '../services/issue-service.js';
import { getTimezone } from '../utils/config.js';
import {
  formatIssueDetail,
  formatIssueTable,
  outputResult,
  statusLabel,
  priorityLabel,
} from '../utils/formatter.js';

const epicCreate = new Command('create')
  .description('Create a new epic')
  .argument('<title>', 'Epic title')
  .option('-d, --description <text>', 'Epic description')
  .option('-p, --priority <n>', 'Priority (0=critical, 3=low)', '2')
  .option('--json', 'Output as JSON', false)
  .action(async (title: string, opts) => {
    try {
      const priority = parseInt(opts.priority, 10) as Priority;

      const issue = await createIssue({
        title,
        description: opts.description,
        type: 'epic',
        priority,
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

const epicAddChild = new Command('add-child')
  .description('Add a child issue to an epic')
  .argument('<epicId>', 'Epic issue ID')
  .argument('<childId>', 'Child issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (epicId: string, childId: string, opts) => {
    try {
      const updated = await addChildToEpic(epicId, childId);

      if (opts.json) {
        outputResult(updated, true);
      } else {
        console.log(`Added ${childId} to epic ${epicId} as child #${updated.childIndex}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const epicList = new Command('list')
  .description('List all epics')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const epics = await listIssues({ type: 'epic' });

      if (opts.json) {
        outputResult(epics, true);
      } else {
        if (epics.length === 0) {
          console.log('No epics found.');
        } else {
          const tz = getTimezone();
          console.log(formatIssueTable(epics, tz));
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const epicShow = new Command('show')
  .description('Show epic details with children')
  .argument('<id>', 'Epic issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts) => {
    try {
      const epic = await getIssue(id);

      if (!isEpic(epic)) {
        console.error(`Error: Issue ${id} is not an epic (type: ${epic.type})`);
        process.exit(1);
      }

      const children = await getEpicChildren(id);

      if (opts.json) {
        outputResult({ epic, children }, true);
      } else {
        const tz = getTimezone();
        console.log(formatIssueDetail(epic, tz));
        console.log('');
        if (children.length === 0) {
          console.log('No children.');
        } else {
          console.log(`Children (${children.length}):`);
          for (const child of children) {
            console.log(
              `  ${child.childIndex ?? '-'}. ${child.id} ${child.title} [${statusLabel(child.status)}] ${priorityLabel(child.priority)}`,
            );
          }
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const epicCommand = new Command('epic')
  .description('Manage epics')
  .addCommand(epicCreate)
  .addCommand(epicAddChild)
  .addCommand(epicList)
  .addCommand(epicShow);
