import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import type { Issue } from '../types/index.js';
import { bulkUpsertIssues } from '../services/issue-service.js';
import { outputResult } from '../utils/formatter.js';

export const importCommand = new Command('import')
  .description('Import issues from a JSONL file (upsert: create if new, update if exists)')
  .requiredOption('--file <path>', 'Path to JSONL file')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const content = readFileSync(opts.file, 'utf-8');
      const lines = content.trim().split('\n').filter((line: string) => line.length > 0);

      const issues: Issue[] = lines.map((line: string, idx: number) => {
        try {
          const parsed = JSON.parse(line) as Issue;
          // Restore date fields from JSON strings
          parsed.createdAt = new Date(parsed.createdAt);
          parsed.updatedAt = new Date(parsed.updatedAt);
          if (parsed.closedAt) parsed.closedAt = new Date(parsed.closedAt);
          if (parsed.jiraSyncedAt) parsed.jiraSyncedAt = new Date(parsed.jiraSyncedAt);
          return parsed;
        } catch {
          throw new Error(`Invalid JSON on line ${idx + 1}`);
        }
      });

      const result = await bulkUpsertIssues(issues);

      if (opts.json) {
        outputResult({ imported: result.count, created: result.created, updated: result.updated }, true);
      } else {
        console.log(`Imported ${result.count} issues (${result.created} created, ${result.updated} updated)`);
      }
    } catch (error) {
      console.error('Import failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
