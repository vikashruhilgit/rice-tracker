import { Command } from 'commander';
import chalk from 'chalk';
import {
  parseOlderThan,
  getCompactCandidates,
  compactIssues,
  getArchivedIssue,
} from '../services/compact-service.js';
import { getTimezone } from '../utils/config.js';
import { formatIssueDetail, outputResult } from '../utils/formatter.js';

const DEFAULT_OLDER_THAN = '30d';

export const compactCommand = new Command('compact')
  .description('Compact old closed issues into archived stubs')
  .option('--older-than <period>', 'Compact issues closed more than this many days ago (e.g., 7d, 30d)', DEFAULT_OLDER_THAN)
  .option('--apply', 'Actually compact (default is dry-run)', false)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const olderThanMs = parseOlderThan(opts.olderThan);
      const candidates = await getCompactCandidates(olderThanMs);

      if (candidates.length === 0) {
        if (opts.json) {
          outputResult({ dryRun: !opts.apply, matched: 0, compacted: 0, skipped: 0, issues: [] }, true);
        } else {
          console.log('No issues eligible for compaction.');
        }
        return;
      }

      const report = await compactIssues(candidates, opts.apply);

      if (opts.json) {
        outputResult(report, true);
      } else {
        const toCompact = report.issues.filter((i) => i.reason === 'compacted');
        const skipped = report.issues.filter((i) => i.reason === 'skipped');

        if (report.dryRun) {
          console.log(chalk.yellow('Dry run — no changes applied. Use --apply to compact.'));
          const cutoffDate = new Date(Date.now() - olderThanMs).toISOString().split('T')[0];
          console.log(`  Would compact ${toCompact.length} issues closed before ${cutoffDate}`);
          if (skipped.length > 0) {
            console.log(`  Would skip ${skipped.length} issues:`);
            for (const s of skipped) {
              console.log(`    - ${s.id} "${s.title}" → ${s.skipReason}`);
            }
          }
        } else {
          console.log(`Compacting ${toCompact.length} issues...`);
          for (const c of toCompact) {
            console.log(`  ${chalk.green('✓')} ${c.id} "${c.title}" → archived`);
          }
          if (skipped.length > 0) {
            for (const s of skipped) {
              console.log(`  ${chalk.yellow('-')} ${s.id} "${s.title}" → skipped (${s.skipReason})`);
            }
          }
          console.log(`Done. ${report.compacted} compacted, ${report.skipped} skipped.`);
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

compactCommand
  .command('show')
  .description('Show full archived issue from the archived collection')
  .argument('<id>', 'Issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts) => {
    try {
      const issue = await getArchivedIssue(id);

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
