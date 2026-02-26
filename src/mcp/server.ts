import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getFirebaseApp } from '../firebase/client.js';
import { registerIssueTools } from './tools/issues.js';
import { registerDepsTools } from './tools/deps.js';
import { registerCommentTools } from './tools/comments.js';
import { registerLabelTools } from './tools/labels.js';
import { registerExportTool } from './tools/export.js';

export async function startMcpServer(): Promise<void> {
  // Initialize Firebase before any tool can be called
  getFirebaseApp();

  const server = new McpServer(
    { name: 'rice-tracker', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'rice-tracker MCP server — manage issues, dependencies, comments, and labels in Firebase Firestore.',
    },
  );

  registerIssueTools(server);
  registerDepsTools(server);
  registerCommentTools(server);
  registerLabelTools(server);
  registerExportTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
