import { Command } from 'commander';
import { pullFromJira } from '../../services/sync-service.js';
import { outputResult } from '../../utils/formatter.js';

export const pullCommand = new Command('pull')
  .description('Pull issues from Jira')
  .option('--jql <query>', 'Custom JQL query')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const results = await pullFromJira(opts.jql);

      if (opts.json) {
        outputResult(results, true);
      } else {
        if (results.length === 0) {
          console.log('No issues to pull from Jira.');
        } else {
          for (const r of results) {
            const verb = r.action === 'created' ? 'Created' : 'Updated';
            console.log(`  ${verb} ${r.issueId} <- ${r.jiraKey}`);
          }
          console.log(`\nPulled ${results.length} issue(s) from Jira.`);
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
