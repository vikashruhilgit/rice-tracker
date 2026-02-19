import { createHash } from 'node:crypto';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import type { Issue, IssueType, IssueStatus, Priority, AuditEvent } from '../types/index.js';
import { issuesCollection, eventsCollection } from '../firebase/collections.js';
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
    parentId: null,
    childIndex: null,
    jiraKey: null,
    jiraSyncedAt: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    createdBy: userId,
    contentHash: contentHash(data.title, data.description ?? ''),
  };

  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  await setDoc(docRef, issueConverter.toFirestore(issue));

  const event: AuditEvent = {
    id: generateId(),
    issueId: id,
    action: 'created',
    changes: {},
    createdAt: now,
    createdBy: userId,
  };
  const evtRef = doc(eventsCollection(projectId), event.id);
  await setDoc(evtRef, {
    ...event,
    createdAt: Timestamp.fromDate(event.createdAt),
  });

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
  labels?: string[];
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
  if (filters?.labels && filters.labels.length > 0) {
    constraints.push(where('labels', 'array-contains-any', filters.labels));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  const q = query(colRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => issueConverter.fromFirestore(docSnap));
}

export async function updateIssue(
  id: string,
  updates: Partial<Pick<Issue, 'title' | 'description' | 'type' | 'priority' | 'status' | 'assignee' | 'labels'>>,
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

  const firestoreUpdates: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.fromDate(now),
  };

  if (updates.title !== undefined || updates.description !== undefined) {
    firestoreUpdates.contentHash = contentHash(
      updates.title ?? existing.title,
      updates.description ?? existing.description,
    );
  }

  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  await updateDoc(docRef, firestoreUpdates);

  const event: AuditEvent = {
    id: generateId(),
    issueId: id,
    action: 'updated',
    changes,
    createdAt: now,
    createdBy: userId,
  };
  const evtRef = doc(eventsCollection(projectId), event.id);
  await setDoc(evtRef, {
    ...event,
    createdAt: Timestamp.fromDate(event.createdAt),
  });

  return { ...existing, ...updates, updatedAt: now };
}

export async function closeIssue(id: string): Promise<Issue> {
  const projectId = getCurrentProjectId();
  const userId = getCurrentUserId();
  const existing = await getIssue(id);
  const now = new Date();

  const colRef = issuesCollection(projectId);
  const docRef = doc(colRef, id);
  await updateDoc(docRef, {
    status: 'closed',
    closedAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  const event: AuditEvent = {
    id: generateId(),
    issueId: id,
    action: 'closed',
    changes: { status: { from: existing.status, to: 'closed' } },
    createdAt: now,
    createdBy: userId,
  };
  const evtRef = doc(eventsCollection(projectId), event.id);
  await setDoc(evtRef, {
    ...event,
    createdAt: Timestamp.fromDate(event.createdAt),
  });

  return { ...existing, status: 'closed', closedAt: now, updatedAt: now };
}
