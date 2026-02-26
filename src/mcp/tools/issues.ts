import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createIssue,
  getIssue,
  listIssues,
  updateIssue,
  closeIssue,
} from '../../services/issue-service.js';
import type { IssueType, IssueStatus, Priority } from '../../types/index.js';

function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function errorResult(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }],
    isError: true as const,
  };
}

export function registerIssueTools(server: McpServer): void {
  server.registerTool(
    'rt_create_issue',
    {
      description: 'Create a new issue and return the issue JSON',
      inputSchema: {
        title: z.string().describe('Issue title'),
        type: z.enum(['task', 'bug', 'epic', 'message', 'decision']).optional().describe('Issue type (default: task)'),
        priority: z.number().int().min(0).max(3).optional().describe('Priority 0=critical 1=high 2=medium 3=low (default: 2)'),
        description: z.string().optional().describe('Issue description'),
        assignee: z.string().optional().describe('Assignee user ID'),
      },
    },
    async (args) => {
      try {
        const issue = await createIssue({
          title: args.title,
          type: args.type as IssueType | undefined,
          priority: args.priority as Priority | undefined,
          description: args.description,
          assignee: args.assignee,
        });
        return { content: [{ type: 'text', text: toJson(issue) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_list_issues',
    {
      description: 'List issues with optional filters, returns array of issue JSON',
      inputSchema: {
        status: z.enum(['open', 'in_progress', 'closed']).optional().describe('Filter by status'),
        type: z.enum(['task', 'bug', 'epic', 'message', 'decision']).optional().describe('Filter by type'),
        priority: z.number().int().min(0).max(3).optional().describe('Filter by priority'),
        assignee: z.string().optional().describe('Filter by assignee user ID'),
        label: z.string().optional().describe('Filter by label name'),
      },
    },
    async (args) => {
      try {
        const issues = await listIssues({
          status: args.status as IssueStatus | undefined,
          type: args.type as IssueType | undefined,
          priority: args.priority as Priority | undefined,
          assignee: args.assignee,
          labels: args.label ? [args.label] : undefined,
        });
        return { content: [{ type: 'text', text: toJson(issues) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_get_issue',
    {
      description: 'Get a single issue by ID, returns full issue JSON',
      inputSchema: {
        id: z.string().describe('Issue ID (e.g. rt-a1b2)'),
      },
    },
    async (args) => {
      try {
        const issue = await getIssue(args.id);
        return { content: [{ type: 'text', text: toJson(issue) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_update_issue',
    {
      description: 'Update fields on an existing issue, returns updated issue JSON',
      inputSchema: {
        id: z.string().describe('Issue ID'),
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(['task', 'bug', 'epic', 'message', 'decision']).optional(),
        priority: z.number().int().min(0).max(3).optional(),
        status: z.enum(['open', 'in_progress', 'closed']).optional(),
        assignee: z.string().nullable().optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      try {
        const { id, ...rest } = args;
        const updates = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined),
        ) as Parameters<typeof updateIssue>[1];
        const issue = await updateIssue(id, updates);
        return { content: [{ type: 'text', text: toJson(issue) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_close_issue',
    {
      description: 'Close an issue, returns updated issue JSON',
      inputSchema: {
        id: z.string().describe('Issue ID'),
      },
    },
    async (args) => {
      try {
        const issue = await closeIssue(args.id);
        return { content: [{ type: 'text', text: toJson(issue) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
