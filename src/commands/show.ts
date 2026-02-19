import { Command } from 'commander';
import { getIssue } from '../services/issue-service.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueDetail, outputResult } from '../utils/formatter.js';

export const showCommand = new Command('show')
  .description('Show issue details')
  .argument('<id>', 'Issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts) => {
    try {
      const issue = await getIssue(id);

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
