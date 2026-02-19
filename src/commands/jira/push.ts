import { Command } from 'commander';
import { pushToJira } from '../../services/sync-service.js';
import { outputResult } from '../../utils/formatter.js';

export const pushCommand = new Command('push')
  .description('Push an issue to Jira')
  .argument('<id>', 'Issue ID to push')
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts) => {
    try {
      const result = await pushToJira(id);

      if (opts.json) {
        outputResult(result, true);
      } else {
        if (result.action === 'created') {
          console.log(`Created Jira issue ${result.jiraKey} from ${result.issueId}`);
        } else {
          console.log(`Updated Jira issue ${result.jiraKey} from ${result.issueId}`);
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
