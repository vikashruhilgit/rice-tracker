import { Command } from 'commander';
import { pullFromGithub } from '../../services/github-sync-service.js';
import { outputResult } from '../../utils/formatter.js';

export const pullCommand = new Command('pull')
  .description('Pull GitHub Issues into rt')
  .option('--filter <query>', 'GitHub Issues search filter (e.g., "label:bug is:open")')
  .option('--force', 'Overwrite local changes even if conflicts exist', false)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const summary = await pullFromGithub(opts.filter, opts.force);

      if (opts.json) {
        outputResult({
          created: summary.created,
          updated: summary.updated,
          skipped: summary.skipped,
          conflicts: summary.conflicts,
        }, true);
      } else {
        for (const r of summary.results) {
          if (r.action === 'created') {
            console.log(`  Created ${r.issueId} <- GitHub #${r.githubNumber}`);
          } else if (r.action === 'updated') {
            console.log(`  Updated ${r.issueId} <- GitHub #${r.githubNumber}`);
          } else if (r.action === 'skipped') {
            console.log(`  Skipped ${r.issueId} (conflict with GitHub #${r.githubNumber})`);
          }
        }

        if (summary.conflicts.length > 0) {
          console.log(`\nConflicts (${summary.conflicts.length}):`);
          for (const c of summary.conflicts) {
            console.log(`  ${c.rtId} <-> GitHub #${c.githubNumber}: ${c.reason}`);
          }
          console.log('Use --force to overwrite local changes.');
        }

        const total = summary.created + summary.updated + summary.skipped;
        if (total === 0) {
          console.log('No issues to pull from GitHub.');
        } else {
          console.log(
            `\nPulled from GitHub: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped.`,
          );
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
