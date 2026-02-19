import { Command } from 'commander';
import { syncAll } from '../../services/sync-service.js';
import { outputResult } from '../../utils/formatter.js';

export const syncCommand = new Command('sync')
  .description('Bi-directional sync with Jira')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const results = await syncAll();

      if (opts.json) {
        outputResult(results, true);
      } else {
        if (results.length === 0) {
          console.log('Everything is in sync.');
        } else {
          const pulled = results.filter((r) => r.direction === 'pull');
          const pushed = results.filter((r) => r.direction === 'push');

          if (pulled.length > 0) {
            console.log(`Pulled ${pulled.length} issue(s) from Jira:`);
            for (const r of pulled) {
              const verb = r.action === 'created' ? 'Created' : 'Updated';
              console.log(`  ${verb} ${r.issueId} <- ${r.jiraKey}`);
            }
          }

          if (pushed.length > 0) {
            console.log(`Pushed ${pushed.length} issue(s) to Jira:`);
            for (const r of pushed) {
              const verb = r.action === 'created' ? 'Created' : 'Updated';
              console.log(`  ${verb} ${r.issueId} -> ${r.jiraKey}`);
            }
          }

          console.log(`\nSynced ${results.length} issue(s) total.`);
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
