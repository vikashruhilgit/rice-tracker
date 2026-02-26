import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listIssues } from '../../services/issue-service.js';
import { errorResult } from './helpers.js';

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
