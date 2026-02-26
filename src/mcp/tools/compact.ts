import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getCompactCandidates,
  compactIssues,
  getArchivedIssue,
  parseOlderThan,
} from '../../services/compact-service.js';
import { toJson, errorResult } from './helpers.js';

export function registerCompactTools(server: McpServer): void {
  server.registerTool(
    'rt_compact',
    {
      description: 'Compact old closed issues. Dry-run by default.',
      inputSchema: {
        olderThan: z.string().optional().describe('Age cutoff e.g. 30d (default: 30d)'),
        apply: z.boolean().optional().describe('Actually compact (default: false = dry-run)'),
      },
    },
    async (args) => {
      try {
        const ms = parseOlderThan(args.olderThan ?? '30d');
        const candidates = await getCompactCandidates(ms);
        const report = await compactIssues(candidates, args.apply ?? false);
        return { content: [{ type: 'text', text: toJson(report) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_compact_show',
    {
      description: 'Retrieve a compacted (archived) issue by ID',
      inputSchema: {
        id: z.string().describe('Issue ID e.g. rt-a1b2'),
      },
    },
    async (args) => {
      try {
        const issue = await getArchivedIssue(args.id);
        return { content: [{ type: 'text', text: toJson(issue) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
