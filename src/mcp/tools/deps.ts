import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDependency, getReadyIssues } from '../../services/dependency-service.js';
import type { DependencyType } from '../../types/index.js';
import { toJson, errorResult } from './helpers.js';

export function registerDepsTools(server: McpServer): void {
  server.registerTool(
    'rt_add_dependency',
    {
      description: 'Add a dependency between two issues, returns dependency JSON',
      inputSchema: {
        from: z.string().describe('Source issue ID (the blocker)'),
        to: z.string().describe('Target issue ID (the blocked issue)'),
        type: z
          .enum(['blocks', 'related', 'parent_child', 'discovered_from', 'duplicates', 'supersedes', 'replies_to'])
          .optional()
          .describe('Dependency type (default: blocks)'),
      },
    },
    async (args) => {
      try {
        const dep = await addDependency(args.from, args.to, args.type as DependencyType | undefined);
        return { content: [{ type: 'text', text: toJson(dep) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_get_ready_issues',
    {
      description: 'Get all open issues with no unresolved blockers, returns array of issue JSON',
      inputSchema: {},
    },
    async () => {
      try {
        const issues = await getReadyIssues();
        return { content: [{ type: 'text', text: toJson(issues) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
