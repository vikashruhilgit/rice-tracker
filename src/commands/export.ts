import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { listIssues } from '../services/issue-service.js';
import { outputResult } from '../utils/formatter.js';

export const exportCommand = new Command('export')
  .description('Export all issues as JSONL (one JSON object per line)')
  .option('--output <file>', 'Write to file instead of stdout')
  .option('--json', 'Output metadata as JSON', false)
  .action(async (opts) => {
    try {
      const issues = await listIssues();

      const lines = issues.map((issue) => JSON.stringify(issue));
      const jsonl = lines.join('\n');

      if (opts.output) {
        writeFileSync(opts.output, jsonl + '\n', 'utf-8');
        if (opts.json) {
          outputResult({ file: opts.output, count: issues.length }, true);
        } else {
          console.log(`Exported ${issues.length} issues to ${opts.output}`);
        }
      } else {
        if (opts.json) {
          // In --json mode without --output, still write JSONL to stdout
          process.stdout.write(jsonl + '\n');
        } else {
          process.stdout.write(jsonl + '\n');
        }
      }
    } catch (error) {
      console.error('Export failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
