import { Timestamp } from 'firebase/firestore';
import type { Issue } from '../types/index.js';

export function validateIssue(data: Partial<Issue>): string[] {
  const errors: string[] = [];
  if (!data.title || data.title.trim().length === 0) errors.push('Title is required');
  if (data.priority !== undefined && ![0, 1, 2, 3].includes(data.priority)) errors.push('Priority must be 0-3');
  if (data.status && !['open', 'in_progress', 'closed', 'archived'].includes(data.status)) errors.push('Invalid status');
  if (data.type && !['task', 'bug', 'epic', 'message', 'decision'].includes(data.type)) errors.push('Invalid type');
  return errors;
}

export const issueConverter = {
  toFirestore(issue: Issue) {
    return {
      ...issue,
      createdAt: Timestamp.fromDate(issue.createdAt),
      updatedAt: Timestamp.fromDate(issue.updatedAt),
      closedAt: issue.closedAt ? Timestamp.fromDate(issue.closedAt) : null,
      jiraSyncedAt: issue.jiraSyncedAt ? Timestamp.fromDate(issue.jiraSyncedAt) : null,
      githubSyncedAt: issue.githubSyncedAt ? Timestamp.fromDate(issue.githubSyncedAt) : null,
      deferUntil: issue.deferUntil ? Timestamp.fromDate(issue.deferUntil) : null,
      dueAt: issue.dueAt ? Timestamp.fromDate(issue.dueAt) : null,
    };
  },
  fromFirestore(snapshot: { data: () => Record<string, any> }): Issue {
    const data = snapshot.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      updatedAt: data.updatedAt?.toDate() ?? new Date(),
      closedAt: data.closedAt?.toDate() ?? null,
      jiraSyncedAt: data.jiraSyncedAt?.toDate() ?? null,
      githubNumber: data.githubNumber ?? null,
      githubSyncedAt: data.githubSyncedAt?.toDate() ?? null,
      githubPrUrl: data.githubPrUrl ?? null,
      githubContentHashAtSync: data.githubContentHashAtSync ?? null,
      deferUntil: data.deferUntil?.toDate() ?? null,
      dueAt: data.dueAt?.toDate() ?? null,
    } as Issue;
  },
};
