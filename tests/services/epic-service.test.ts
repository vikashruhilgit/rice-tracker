import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Issue } from '../../src/types/index.js';

// ── Mock Firebase ────────────────────────────────────────────────────

vi.mock('firebase/firestore', () => {
  const Timestamp = {
    fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
  };
  return {
    doc: vi.fn((_col: unknown, id: string) => ({ id, path: `mock/${id}` })),
    setDoc: vi.fn().mockResolvedValue(undefined),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn((...args: unknown[]) => args),
    where: vi.fn((...args: unknown[]) => args),
    orderBy: vi.fn((...args: unknown[]) => args),
    collection: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../src/utils/id-generator.js', () => ({
  generateId: vi.fn(() => 'rt-mock01'),
}));

vi.mock('../../src/models/issue.js', () => ({
  issueConverter: {
    toFirestore: (issue: Issue) => ({
      ...issue,
      createdAt: { toDate: () => issue.createdAt },
      updatedAt: { toDate: () => issue.updatedAt },
      closedAt: issue.closedAt ? { toDate: () => issue.closedAt } : null,
      jiraSyncedAt: issue.jiraSyncedAt ? { toDate: () => issue.jiraSyncedAt } : null,
    }),
    fromFirestore: (snapshot: { data: () => Record<string, unknown> }) => {
      const data = snapshot.data();
      return {
        ...data,
        createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
        updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
        closedAt: data.closedAt ? (data.closedAt as { toDate: () => Date })?.toDate?.() : null,
        jiraSyncedAt: data.jiraSyncedAt ? (data.jiraSyncedAt as { toDate: () => Date })?.toDate?.() : null,
      } as Issue;
    },
  },
}));

vi.mock('../../src/models/epic.js', () => ({
  isEpic: vi.fn((issue: Issue) => issue.type === 'epic'),
  getNextChildIndex: vi.fn((children: Issue[]) => {
    if (children.length === 0) return 1;
    const max = Math.max(...children.map((c) => c.childIndex ?? 0));
    return max + 1;
  }),
}));

// ── Import after mocks ──────────────────────────────────────────────

const { getEpicChildren, addChildToEpic } = await import('../../src/services/epic-service.js');

// ── Helpers ─────────────────────────────────────────────────────────

function makeFirestoreDoc(overrides: Partial<Issue> & { id: string }) {
  const now = new Date();
  return {
    exists: () => true,
    data: () => ({
      id: overrides.id,
      title: `Issue ${overrides.id}`,
      description: '',
      type: overrides.type ?? 'task',
      status: overrides.status ?? 'open',
      priority: 2,
      assignee: null,
      labels: [],
      parentId: overrides.parentId ?? null,
      childIndex: overrides.childIndex ?? null,
      jiraKey: null,
      jiraSyncedAt: null,
      createdAt: { toDate: () => now },
      updatedAt: { toDate: () => now },
      closedAt: null,
      createdBy: 'test-user',
      contentHash: 'abc',
    }),
    id: overrides.id,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEpicChildren', () => {
  it('returns empty array when epic has no children', async () => {
    const { getDocs } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);

    const result = await getEpicChildren('rt-epic1');

    expect(result).toEqual([]);
  });

  it('returns children ordered by childIndex', async () => {
    const { getDocs } = await import('firebase/firestore');
    const child1 = makeFirestoreDoc({ id: 'rt-ch1', parentId: 'rt-epic1', childIndex: 1 });
    const child2 = makeFirestoreDoc({ id: 'rt-ch2', parentId: 'rt-epic1', childIndex: 2 });
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [child1, child2] } as any);

    const result = await getEpicChildren('rt-epic1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('rt-ch1');
    expect(result[1].id).toBe('rt-ch2');
  });

  it('queries with correct parentId filter', async () => {
    const { getDocs, where } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);

    await getEpicChildren('rt-epic99');

    expect(where).toHaveBeenCalledWith('parentId', '==', 'rt-epic99');
  });
});

describe('addChildToEpic', () => {
  it('adds child to epic with correct childIndex', async () => {
    const { getDoc, getDocs, updateDoc } = await import('firebase/firestore');

    // First call: getIssue(epicId) - returns epic
    const epicDoc = makeFirestoreDoc({ id: 'rt-epic1', type: 'epic' });
    // Second call: getIssue(childId) - returns task with no parent
    const childDoc = makeFirestoreDoc({ id: 'rt-task1' });
    vi.mocked(getDoc)
      .mockResolvedValueOnce(epicDoc as any)
      .mockResolvedValueOnce(childDoc as any);

    // getEpicChildren returns empty (no existing children)
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);

    const result = await addChildToEpic('rt-epic1', 'rt-task1');

    expect(result.parentId).toBe('rt-epic1');
    expect(result.childIndex).toBe(1);
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('throws if target is not an epic', async () => {
    const { getDoc } = await import('firebase/firestore');
    const taskDoc = makeFirestoreDoc({ id: 'rt-task1', type: 'task' });
    vi.mocked(getDoc).mockResolvedValueOnce(taskDoc as any);

    await expect(addChildToEpic('rt-task1', 'rt-child')).rejects.toThrow('is not an epic');
  });

  it('throws if child already has a parent', async () => {
    const { getDoc } = await import('firebase/firestore');
    const epicDoc = makeFirestoreDoc({ id: 'rt-epic1', type: 'epic' });
    const childDoc = makeFirestoreDoc({ id: 'rt-task1', parentId: 'rt-other' });
    vi.mocked(getDoc)
      .mockResolvedValueOnce(epicDoc as any)
      .mockResolvedValueOnce(childDoc as any);

    await expect(addChildToEpic('rt-epic1', 'rt-task1')).rejects.toThrow('already belongs to parent');
  });

  it('assigns next index based on existing children count', async () => {
    const { getDoc, getDocs } = await import('firebase/firestore');

    const epicDoc = makeFirestoreDoc({ id: 'rt-epic1', type: 'epic' });
    const childDoc = makeFirestoreDoc({ id: 'rt-task3' });
    vi.mocked(getDoc)
      .mockResolvedValueOnce(epicDoc as any)
      .mockResolvedValueOnce(childDoc as any);

    // Two existing children
    const existing1 = makeFirestoreDoc({ id: 'rt-ch1', childIndex: 1 });
    const existing2 = makeFirestoreDoc({ id: 'rt-ch2', childIndex: 2 });
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [existing1, existing2] } as any);

    const result = await addChildToEpic('rt-epic1', 'rt-task3');

    expect(result.childIndex).toBe(3);
  });
});
