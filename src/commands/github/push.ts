import { Command } from 'commander';
import { pushToGithub, pushAllToGithub } from '../../services/github-sync-service.js';
import { outputResult } from '../../utils/formatter.js';

export const pushCommand = new Command('push')
  .description('Push rt issues to GitHub Issues')
  .argument('[id]', 'Issue ID to push (omit for --all)')
  .option('--all', 'Push all issues without a GitHub issue number', false)
  .option('--json', 'Output as JSON', false)
  .action(async (id: string | undefined, opts) => {
    try {
      if (!id && !opts.all) {
        throw new Error('Provide an issue ID or use --all to push all issues.');
      }

      if (opts.all) {
        const results = await pushAllToGithub();

        if (opts.json) {
          outputResult(results, true);
        } else {
          if (results.length === 0) {
            console.log('No issues to push to GitHub.');
          } else {
            for (const r of results) {
              console.log(`  Created GitHub #${r.githubNumber} from ${r.issueId}`);
            }
            console.log(`\nPushed ${results.length} issue(s) to GitHub.`);
          }
        }
        return;
      }

      const result = await pushToGithub(id!);

      if (opts.json) {
        outputResult(result, true);
      } else {
        if (result.action === 'created') {
          console.log(`Created GitHub #${result.githubNumber} from ${result.issueId}`);
        } else {
          console.log(`Updated GitHub #${result.githubNumber} from ${result.issueId}`);
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
