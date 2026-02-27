import { createHash } from 'node:crypto';
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import type { Issue, IssueType, IssueStatus, Priority, AuditEvent } from '../types/index.js';
import { issuesCollection, eventsCollection } from '../firebase/collections.js';
import { getDb } from '../firebase/client.js';
import { getCurrentUserId } from '../firebase/auth.js';
import { generateId } from '../utils/id-generator.js';
import { getCurrentProjectId } from '../utils/config.js';
import { issueConverter } from '../models/issue.js';

function contentHash(title: string, description: string): string {
  return createHash('sha256').update(`${title}|${description}`).digest('hex').slice(0, 16);
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  type?: IssueType;
  priority?: Priority;
  assignee?: string;
  labels?: string[];
  labelIds?: string[];
  deferUntil?: Date;
  dueAt?: Date;
}

export async function createIssue(data: CreateIssueInput): Promise<Issue> {
  const projectId = getCurrentProjectId();
  const userId = getCurrentUserId();
  const id = generateId();
  const now = new Date();

  const issue: Issue = {
    id,
    title: data.title,
    description: data.description ?? '',
    type: data.type ?? 'task',
    status: 'open',
    priority: data.priority ?? 2,
    assignee: data.assignee ?? null,
    labels: data.labels ?? [],
    labelIds: data.labelIds ?? [],
    parentId: null,
    childIndex: null,
    jiraKey: null,
    jiraSyncedAt: null,
    jiraContentHash: null,
    githubNumber: null,
    githubSyncedAt: null,
    githubPrUrl: null,
    githubContentHashAtSync: null,
    deferUntil: data.deferUntil ?? null,
    dueAt: data.dueAt ?? null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    createdBy: userId,
    contentHash: contentHash(data.title, data.description ?? ''),
  };

  const event: AuditEvent = {
    id: generateId(),
    issueId: id,
    action: 'created',
    changes: {},
    createdAt: now,
    createdBy: userId,
  };

  // Atomic write: issue + audit event in one batch
  const db = getDb();
  const batch = writeBatch(db);

  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  batch.set(docRef, issueConverter.toFirestore(issue));

  const evtRef = doc(eventsCollection(projectId), event.id);
  batch.set(evtRef, {
    ...event,
    createdAt: Timestamp.fromDate(event.createdAt),
  });

  await batch.commit();

  return issue;
}

export async function getIssue(id: string): Promise<Issue> {
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    throw new Error(`Issue ${id} not found`);
  }

  return issueConverter.fromFirestore(snapshot);
}

export interface ListIssuesFilters {
  status?: IssueStatus;
  priority?: Priority;
  assignee?: string;
  type?: IssueType;
  labels?: string[];      // Legacy: filter by label names
  labelIds?: string[];    // Preferred: filter by label IDs
  overdue?: boolean;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export async function listIssues(filters?: ListIssuesFilters): Promise<Issue[]> {
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);

  const constraints = [];

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters?.priority !== undefined) {
    constraints.push(where('priority', '==', filters.priority));
  }
  if (filters?.assignee) {
    constraints.push(where('assignee', '==', filters.assignee));
  }
  if (filters?.type) {
    constraints.push(where('type', '==', filters.type));
  }
  if (filters?.labelIds && filters.labelIds.length > 0) {
    constraints.push(where('labelIds', 'array-contains-any', filters.labelIds));
  } else if (filters?.labels && filters.labels.length > 0) {
    constraints.push(where('labels', 'array-contains-any', filters.labels));
  }

  // Overdue filter: fetch all and filter client-side (avoids composite index requirement)
  if (filters?.overdue) {
    const now = new Date();
    constraints.push(orderBy('createdAt', 'desc'));
    const q = query(colRef, ...constraints);
    const snapshot = await getDocs(q);
    const all = snapshot.docs.map((docSnap) => issueConverter.fromFirestore(docSnap));
    return all.filter((issue) => issue.dueAt !== null && issue.dueAt < now && issue.status !== 'closed');
  }

  constraints.push(orderBy('createdAt', 'desc'));

  const q = query(colRef, ...constraints);
  const snapshot = await getDocs(q);

  let issues = snapshot.docs.map((docSnap) => issueConverter.fromFirestore(docSnap));

  // Exclude archived issues from default listing (same as closed behavior)
  // Only include archived if explicitly filtering by status: 'archived'
  if (!filters?.status) {
    issues = issues.filter((i) => i.status !== 'archived');
  }

  return issues;
}

export async function paginatedListIssues(
  filters?: ListIssuesFilters,
  pagination?: PaginationOptions,
): Promise<PaginatedResult<Issue>> {
  // Fetch all matching issues first (pagination applied client-side after filtering)
  const allIssues = await listIssues(filters);
  const total = allIssues.length;
  const offset = pagination?.offset ?? 0;
  const lim = pagination?.limit;
  const items = lim !== undefined ? allIssues.slice(offset, offset + lim) : allIssues.slice(offset);
  return { items, total, hasMore: lim !== undefined ? offset + lim < total : false };
}

export async function updateIssue(
  id: string,
  updates: Partial<Pick<Issue, 'title' | 'description' | 'type' | 'priority' | 'status' | 'assignee' | 'labels' | 'labelIds' | 'deferUntil' | 'dueAt'>>,
): Promise<Issue> {
  const projectId = getCurrentProjectId();
  const userId = getCurrentUserId();
  const existing = await getIssue(id);
  const now = new Date();

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(updates)) {
    const oldVal = existing[key as keyof Issue];
    if (oldVal !== value) {
      changes[key] = { from: oldVal, to: value };
    }
  }

  const { deferUntil, dueAt, ...restUpdates } = updates;
  const firestoreUpdates: Record<string, unknown> = {
    ...restUpdates,
    updatedAt: Timestamp.fromDate(now),
  };

  if (deferUntil !== undefined) {
    firestoreUpdates.deferUntil = deferUntil ? Timestamp.fromDate(deferUntil) : null;
  }
  if (dueAt !== undefined) {
    firestoreUpdates.dueAt = dueAt ? Timestamp.fromDate(dueAt) : null;
  }

  if (updates.title !== undefined || updates.description !== undefined) {
    firestoreUpdates.contentHash = contentHash(
      updates.title ?? existing.title,
      updates.description ?? existing.description,
    );
  }

  const event: AuditEvent = {
    id: generateId(),
    issueId: id,
    action: 'updated',
    changes,
    createdAt: now,
    createdBy: userId,
  };

  // Atomic write: issue update + audit event in one batch
  const db = getDb();
  const batch = writeBatch(db);

  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  batch.update(docRef, firestoreUpdates);

  const evtRef = doc(eventsCollection(projectId), event.id);
  batch.set(evtRef, {
    ...event,
    createdAt: Timestamp.fromDate(event.createdAt),
  });

  await batch.commit();

  return { ...existing, ...updates, updatedAt: now };
}

export async function updateIssueJiraFields(
  id: string,
  jiraKey: string,
  jiraSyncedAt: Date,
  jiraContentHash?: string,
): Promise<void> {
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  const fields: Record<string, unknown> = {
    jiraKey,
    jiraSyncedAt: Timestamp.fromDate(jiraSyncedAt),
    updatedAt: Timestamp.fromDate(new Date()),
  };
  if (jiraContentHash !== undefined) {
    fields.jiraContentHash = jiraContentHash;
  }
  await updateDoc(docRef, fields);
}

export async function updateIssueGithubFields(
  id: string,
  githubNumber: number,
  githubSyncedAt: Date,
  githubContentHashAtSync?: string,
): Promise<void> {
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  const fields: Record<string, unknown> = {
    githubNumber,
    githubSyncedAt: Timestamp.fromDate(githubSyncedAt),
    updatedAt: Timestamp.fromDate(new Date()),
  };
  if (githubContentHashAtSync !== undefined) {
    fields.githubContentHashAtSync = githubContentHashAtSync;
  }
  await updateDoc(docRef, fields);
}

export async function updateIssueGithubPrUrl(
  id: string,
  githubPrUrl: string,
): Promise<void> {
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  await updateDoc(docRef, {
    githubPrUrl,
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

export async function closeIssue(id: string): Promise<Issue> {
  const projectId = getCurrentProjectId();
  const userId = getCurrentUserId();
  const existing = await getIssue(id);
  const now = new Date();

  const event: AuditEvent = {
    id: generateId(),
    issueId: id,
    action: 'closed',
    changes: { status: { from: existing.status, to: 'closed' } },
    createdAt: now,
    createdBy: userId,
  };

  // Atomic write: issue close + audit event in one batch
  const db = getDb();
  const batch = writeBatch(db);

  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  batch.update(docRef, {
    status: 'closed',
    closedAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  const evtRef = doc(eventsCollection(projectId), event.id);
  batch.set(evtRef, {
    ...event,
    createdAt: Timestamp.fromDate(event.createdAt),
  });

  await batch.commit();

  return { ...existing, status: 'closed', closedAt: now, updatedAt: now };
}

export interface BulkUpsertResult {
  count: number;
  created: number;
  updated: number;
}

/**
 * Bulk upsert issues from import. Uses setDoc with merge to create or update.
 * Firestore WriteBatch supports max 500 operations; splits into chunks if needed.
 */
export async function bulkUpsertIssues(issues: Issue[]): Promise<BulkUpsertResult> {
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);
  const db = getDb();

  let created = 0;
  let updated = 0;

  // Check which issues already exist
  const existingIds = new Set<string>();
  for (const issue of issues) {
    const docRef = doc(colRef, issue.id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      existingIds.add(issue.id);
    }
  }

  // Firestore batch limit is 500 operations
  const BATCH_SIZE = 500;
  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const chunk = issues.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const issue of chunk) {
      const docRef = doc(colRef, issue.id);
      batch.set(docRef, issueConverter.toFirestore(issue));

      if (existingIds.has(issue.id)) {
        updated++;
      } else {
        created++;
      }
    }

    await batch.commit();
  }

  return { count: issues.length, created, updated };
}
