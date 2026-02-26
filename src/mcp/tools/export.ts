import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listIssues } from '../../services/issue-service.js';

function errorResult(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }],
    isError: true as const,
  };
}

export function registerExportTool(server: McpServer): void {
  server.registerTool(
    'rt_export',
    {
      description: 'Export all project issues as structured JSON array',
      inputSchema: {},
    },
    async () => {
      try {
        const issues = await listIssues();
        return { content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
