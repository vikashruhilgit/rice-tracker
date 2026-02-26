import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Issue } from '../../src/types/index.js';

// ── Mock Firebase ────────────────────────────────────────────────────

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

const mockGetDocResult = { exists: vi.fn().mockReturnValue(false), data: vi.fn() };
const mockGetDocsResult = { docs: [] as Array<{ data: () => Record<string, unknown> }> };

vi.mock('firebase/firestore', () => {
  const Timestamp = {
    fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
  };
  return {
    doc: vi.fn((_col: unknown, id: string) => ({ id, path: `mock/${id}` })),
    setDoc: vi.fn().mockResolvedValue(undefined),
    getDoc: vi.fn().mockImplementation(() => Promise.resolve(mockGetDocResult)),
    getDocs: vi.fn().mockImplementation(() => Promise.resolve(mockGetDocsResult)),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn((...args: unknown[]) => args),
    where: vi.fn((...args: unknown[]) => args),
    orderBy: vi.fn((...args: unknown[]) => args),
    collection: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
    writeBatch: vi.fn(() => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    })),
    Timestamp,
    getFirestore: vi.fn(() => ({})),
  };
});

vi.mock('../../src/firebase/client.js', () => ({
  getFirebaseApp: vi.fn(() => ({})),
  getDb: vi.fn(() => ({})),
}));

vi.mock('../../src/firebase/auth.js', () => ({
  getCurrentUserId: vi.fn(() => 'test-user'),
}));

vi.mock('../../src/firebase/collections.js', () => ({
  issuesCollection: vi.fn(() => ({ path: 'projects/test/issues' })),
  eventsCollection: vi.fn(() => ({ path: 'projects/test/events' })),
}));

vi.mock('../../src/utils/config.js', () => ({
  getCurrentProjectId: vi.fn(() => 'test-project'),
}));

let idCounter = 0;
vi.mock('../../src/utils/id-generator.js', () => ({
  generateId: vi.fn(() => `rt-test${idCounter++}`),
}));

vi.mock('../../src/models/issue.js', () => ({
  issueConverter: {
    toFirestore: (issue: Issue) => ({
      ...issue,
      createdAt: { toDate: () => issue.createdAt },
      updatedAt: { toDate: () => issue.updatedAt },
      closedAt: issue.closedAt ? { toDate: () => issue.closedAt } : null,
      jiraSyncedAt: issue.jiraSyncedAt ? { toDate: () => issue.jiraSyncedAt } : null,
      deferUntil: issue.deferUntil ? { toDate: () => issue.deferUntil } : null,
      dueAt: issue.dueAt ? { toDate: () => issue.dueAt } : null,
    }),
    fromFirestore: (snapshot: { data: () => Record<string, unknown> }) => {
      const data = snapshot.data();
      return {
        ...data,
        createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
        updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
        closedAt: data.closedAt ? (data.closedAt as { toDate: () => Date })?.toDate?.() : null,
        jiraSyncedAt: data.jiraSyncedAt ? (data.jiraSyncedAt as { toDate: () => Date })?.toDate?.() : null,
        deferUntil: data.deferUntil ? (data.deferUntil as { toDate: () => Date })?.toDate?.() : null,
        dueAt: data.dueAt ? (data.dueAt as { toDate: () => Date })?.toDate?.() : null,
      } as Issue;
    },
  },
}));

// ── Import after mocks ──────────────────────────────────────────────

const { createIssue, updateIssue, closeIssue, getIssue, listIssues, bulkUpsertIssues } =
  await import('../../src/services/issue-service.js');

// ── Helpers ─────────────────────────────────────────────────────────

function makeIssueDoc(overrides: Partial<Issue> & { id: string }) {
  const now = new Date();
  const data = {
    title: `Issue ${overrides.id}`,
    description: '',
    type: 'task' as const,
    status: 'open' as const,
    priority: 2 as const,
    assignee: null,
    labels: [],
    parentId: null,
    childIndex: null,
    jiraKey: null,
    jiraSyncedAt: null,
    deferUntil: null,
    dueAt: null,
    createdAt: { toDate: () => now },
    updatedAt: { toDate: () => now },
    closedAt: null,
    createdBy: 'test-user',
    contentHash: 'abc123',
    ...overrides,
    // Override date fields to firestore-like format
    ...(overrides.createdAt ? { createdAt: { toDate: () => overrides.createdAt! } } : {}),
    ...(overrides.updatedAt ? { updatedAt: { toDate: () => overrides.updatedAt! } } : {}),
    ...(overrides.deferUntil ? { deferUntil: { toDate: () => overrides.deferUntil! } } : { deferUntil: null }),
    ...(overrides.dueAt ? { dueAt: { toDate: () => overrides.dueAt! } } : { dueAt: null }),
  };
  return {
    exists: () => true,
    data: () => data,
    id: overrides.id,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  idCounter = 0;
  mockGetDocResult.exists.mockReturnValue(false);
  mockGetDocsResult.docs = [];
});

describe('createIssue', () => {
  it('creates issue with default values and uses WriteBatch', async () => {
    const result = await createIssue({ title: 'Test issue' });

    expect(result.title).toBe('Test issue');
    expect(result.type).toBe('task');
    expect(result.status).toBe('open');
    expect(result.priority).toBe(2);
    expect(result.createdBy).toBe('test-user');
    expect(result.id).toMatch(/^rt-/);

    // Verify batch was used (set called twice: issue + event)
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('creates issue with custom values', async () => {
    const result = await createIssue({
      title: 'Bug report',
      description: 'Something broke',
      type: 'bug',
      priority: 0,
      assignee: 'dev1',
      labels: ['urgent'],
    });

    expect(result.title).toBe('Bug report');
    expect(result.description).toBe('Something broke');
    expect(result.type).toBe('bug');
    expect(result.priority).toBe(0);
    expect(result.assignee).toBe('dev1');
    expect(result.labels).toEqual(['urgent']);
  });

  it('generates audit event with action "created"', async () => {
    await createIssue({ title: 'Audited issue' });

    // Second set call is the event
    const eventCall = mockBatchSet.mock.calls[1];
    const eventData = eventCall[1];
    expect(eventData.action).toBe('created');
    expect(eventData.issueId).toMatch(/^rt-/);
  });
});

describe('updateIssue', () => {
  it('updates issue fields and uses WriteBatch', async () => {
    const now = new Date();
    const existingDoc = makeIssueDoc({ id: 'rt-exist', title: 'Old title' });
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValueOnce(existingDoc as any);

    const result = await updateIssue('rt-exist', { title: 'New title' });

    expect(result.title).toBe('New title');
    // Verify batch was used (update + set event)
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('records changes in audit event', async () => {
    const existingDoc = makeIssueDoc({ id: 'rt-chg', title: 'Before' });
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValueOnce(existingDoc as any);

    await updateIssue('rt-chg', { title: 'After' });

    const eventCall = mockBatchSet.mock.calls[0];
    const eventData = eventCall[1];
    expect(eventData.action).toBe('updated');
    expect(eventData.changes).toHaveProperty('title');
  });
});

describe('closeIssue', () => {
  it('sets status to closed and uses WriteBatch', async () => {
    const existingDoc = makeIssueDoc({ id: 'rt-cls', status: 'open' });
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValueOnce(existingDoc as any);

    const result = await closeIssue('rt-cls');

    expect(result.status).toBe('closed');
    expect(result.closedAt).toBeInstanceOf(Date);
    // Verify batch was used (update + set event)
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('generates audit event with "closed" action', async () => {
    const existingDoc = makeIssueDoc({ id: 'rt-cls2', status: 'in_progress' });
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValueOnce(existingDoc as any);

    await closeIssue('rt-cls2');

    const eventCall = mockBatchSet.mock.calls[0];
    const eventData = eventCall[1];
    expect(eventData.action).toBe('closed');
    expect(eventData.changes.status).toEqual({ from: 'in_progress', to: 'closed' });
  });
});

describe('getIssue', () => {
  it('throws if issue not found', async () => {
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => ({}) } as any);

    await expect(getIssue('rt-none')).rejects.toThrow('Issue rt-none not found');
  });

  it('returns issue when found', async () => {
    const { getDoc } = await import('firebase/firestore');
    const existingDoc = makeIssueDoc({ id: 'rt-found', title: 'Found it' });
    vi.mocked(getDoc).mockResolvedValueOnce(existingDoc as any);

    const result = await getIssue('rt-found');

    expect(result.title).toBe('Found it');
  });
});

describe('listIssues', () => {
  it('returns empty array when no issues', async () => {
    const { getDocs } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);

    const result = await listIssues();

    expect(result).toEqual([]);
  });

  it('applies filters to query', async () => {
    const { getDocs, where } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);

    await listIssues({ status: 'open', priority: 1 });

    expect(where).toHaveBeenCalledWith('status', '==', 'open');
    expect(where).toHaveBeenCalledWith('priority', '==', 1);
  });
});

describe('createIssue scheduling fields', () => {
  it('returns issue with deferUntil and dueAt set correctly', async () => {
    const deferUntil = new Date('2026-03-01T00:00:00Z');
    const dueAt = new Date('2026-03-15T00:00:00Z');

    const result = await createIssue({ title: 'Scheduled', deferUntil, dueAt });

    expect(result.deferUntil).toEqual(deferUntil);
    expect(result.dueAt).toEqual(dueAt);
    // Batch was committed with the issue (set x2: issue + event)
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});

describe('updateIssue scheduling fields', () => {
  it('sets deferUntil to null on returned issue and passes null to batch.update', async () => {
    const { getDoc } = await import('firebase/firestore');
    const existingDoc = makeIssueDoc({ id: 'rt-defer', deferUntil: new Date('2026-01-01') });
    vi.mocked(getDoc).mockResolvedValueOnce(existingDoc as any);

    const result = await updateIssue('rt-defer', { deferUntil: null });

    expect(result.deferUntil).toBeNull();
    // batch.update should have been called with deferUntil: null
    const updateArg = mockBatchUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateArg.deferUntil).toBeNull();
  });

  it('stores dueAt in Firestore-compatible format when updating', async () => {
    const { getDoc } = await import('firebase/firestore');
    const existingDoc = makeIssueDoc({ id: 'rt-due' });
    vi.mocked(getDoc).mockResolvedValueOnce(existingDoc as any);
    const dueAt = new Date('2026-04-01T00:00:00Z');

    const result = await updateIssue('rt-due', { dueAt });

    expect(result.dueAt).toEqual(dueAt);
    // batch.update should carry a Firestore Timestamp for dueAt (not a raw Date)
    const updateArg = mockBatchUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateArg.dueAt).toHaveProperty('toDate');
  });
});

describe('listIssues overdue filter', () => {
  it('returns issues where dueAt is in the past and status is not closed', async () => {
    const { getDocs } = await import('firebase/firestore');
    const past = new Date(Date.now() - 86_400_000); // yesterday
    const future = new Date(Date.now() + 86_400_000); // tomorrow

    const overdueDoc = makeIssueDoc({ id: 'rt-overdue', dueAt: past, status: 'open' });
    const futureDoc = makeIssueDoc({ id: 'rt-future', dueAt: future, status: 'open' });
    const closedDoc = makeIssueDoc({ id: 'rt-closed', dueAt: past, status: 'closed', closedAt: new Date() });
    const noDueDoc = makeIssueDoc({ id: 'rt-nodue' });

    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [overdueDoc, futureDoc, closedDoc, noDueDoc] } as any);

    const result = await listIssues({ overdue: true });

    expect(result.map((i) => i.id)).toEqual(['rt-overdue']);
  });

  it('excludes closed issues even when dueAt is in the past', async () => {
    const { getDocs } = await import('firebase/firestore');
    const past = new Date(Date.now() - 86_400_000);
    const closedDoc = makeIssueDoc({ id: 'rt-cls', dueAt: past, status: 'closed', closedAt: new Date() });

    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [closedDoc] } as any);

    const result = await listIssues({ overdue: true });

    expect(result).toHaveLength(0);
  });
});

describe('bulkUpsertIssues', () => {
  it('creates new issues via batch', async () => {
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as any);

    const now = new Date();
    const issues: Issue[] = [
      {
        id: 'rt-imp1',
        title: 'Imported 1',
        description: '',
        type: 'task',
        status: 'open',
        priority: 2,
        assignee: null,
        labels: [],
        parentId: null,
        childIndex: null,
        jiraKey: null,
        jiraSyncedAt: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        createdBy: 'import',
        contentHash: 'hash1',
      },
    ];

    const result = await bulkUpsertIssues(issues);

    expect(result.count).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('counts updates for existing issues', async () => {
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ id: 'rt-exist' }),
    } as any);

    const now = new Date();
    const issues: Issue[] = [
      {
        id: 'rt-exist',
        title: 'Updated',
        description: '',
        type: 'task',
        status: 'open',
        priority: 2,
        assignee: null,
        labels: [],
        parentId: null,
        childIndex: null,
        jiraKey: null,
        jiraSyncedAt: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        createdBy: 'import',
        contentHash: 'hash2',
      },
    ];

    const result = await bulkUpsertIssues(issues);

    expect(result.count).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
  });
});
