import { Command } from 'commander';
import { doc, setDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Comment } from '../types/index.js';
import { commentConverter } from '../models/comment.js';
import { commentsCollection } from '../firebase/collections.js';
import { getIssue } from '../services/issue-service.js';
import { generateId } from '../utils/id-generator.js';
import { getCurrentProjectId, getTimezone } from '../utils/config.js';
import { getCurrentUserId } from '../firebase/auth.js';
import { outputResult, formatTimestamp } from '../utils/formatter.js';

const commentAdd = new Command('add')
  .description('Add a comment to an issue')
  .argument('<issueId>', 'Issue ID')
  .argument('<body>', 'Comment body')
  .option('--thread <commentId>', 'Reply to a comment (thread)')
  .option('--json', 'Output as JSON', false)
  .action(async (issueId: string, body: string, opts) => {
    try {
      // Validate issue exists
      await getIssue(issueId);

      const projectId = getCurrentProjectId();
      const userId = getCurrentUserId();
      const colRef = commentsCollection(projectId);

      const comment: Comment = {
        id: generateId(),
        issueId,
        body,
        createdAt: new Date(),
        createdBy: userId,
        thread: opts.thread ?? null,
      };

      const docRef = doc(colRef, comment.id);
      await setDoc(docRef, commentConverter.toFirestore(comment));

      if (opts.json) {
        outputResult(comment, true);
      } else {
        console.log(`Comment added to ${issueId} (${comment.id})`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const commentList = new Command('list')
  .description('List comments for an issue')
  .argument('<issueId>', 'Issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (issueId: string, opts) => {
    try {
      // Validate issue exists
      await getIssue(issueId);

      const projectId = getCurrentProjectId();
      const colRef = commentsCollection(projectId);
      const q = query(
        colRef,
        where('issueId', '==', issueId),
        orderBy('createdAt', 'asc'),
      );
      const snapshot = await getDocs(q);
      const comments = snapshot.docs.map((d) => commentConverter.fromFirestore(d));

      if (opts.json) {
        outputResult(comments, true);
      } else {
        if (comments.length === 0) {
          console.log(`No comments on ${issueId}.`);
        } else {
          const tz = getTimezone();
          for (const c of comments) {
            const threadInfo = c.thread ? ` (reply to ${c.thread})` : '';
            console.log(`[${c.id}] ${c.createdBy} at ${formatTimestamp(c.createdAt, tz)}${threadInfo}`);
            console.log(`  ${c.body}`);
            console.log('');
          }
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const commentCommand = new Command('comment')
  .description('Manage comments')
  .addCommand(commentAdd)
  .addCommand(commentList);
