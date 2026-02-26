import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { doc, setDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Comment } from '../../types/index.js';
import { commentConverter } from '../../models/comment.js';
import { commentsCollection } from '../../firebase/collections.js';
import { getIssue } from '../../services/issue-service.js';
import { generateId } from '../../utils/id-generator.js';
import { getCurrentProjectId } from '../../utils/config.js';
import { getCurrentUserId } from '../../firebase/auth.js';

function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function errorResult(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }],
    isError: true as const,
  };
}

export function registerCommentTools(server: McpServer): void {
  server.registerTool(
    'rt_add_comment',
    {
      description: 'Add a comment to an issue, returns comment JSON',
      inputSchema: {
        issueId: z.string().describe('Issue ID'),
        body: z.string().describe('Comment body text'),
      },
    },
    async (args) => {
      try {
        await getIssue(args.issueId);

        const projectId = getCurrentProjectId();
        const userId = getCurrentUserId();
        const colRef = commentsCollection(projectId);

        const comment: Comment = {
          id: generateId(),
          issueId: args.issueId,
          body: args.body,
          createdAt: new Date(),
          createdBy: userId,
          thread: null,
        };

        const docRef = doc(colRef, comment.id);
        await setDoc(docRef, commentConverter.toFirestore(comment));

        return { content: [{ type: 'text', text: toJson(comment) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_list_comments',
    {
      description: 'List all comments for an issue, returns array of comment JSON',
      inputSchema: {
        issueId: z.string().describe('Issue ID'),
      },
    },
    async (args) => {
      try {
        await getIssue(args.issueId);

        const projectId = getCurrentProjectId();
        const colRef = commentsCollection(projectId);
        const q = query(
          colRef,
          where('issueId', '==', args.issueId),
          orderBy('createdAt', 'asc'),
        );
        const snapshot = await getDocs(q);
        const comments = snapshot.docs.map((d) => commentConverter.fromFirestore(d));

        return { content: [{ type: 'text', text: toJson(comments) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
