import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Issue, Dependency, Label } from '../../src/types/index.js';

// ── Mock Firebase ────────────────────────────────────────────────────

const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  getDocs: vi.fn(),
  doc: vi.fn((_col: unknown, id: string) => ({ id, path: `mock/${id}` })),
  deleteDoc: mockDeleteDoc,
  updateDoc: mockUpdateDoc,
  collection: vi.fn((...args: unknown[]) => ({ path: (args as string[]).join('/') })),
  getFirestore: vi.fn(() => ({})),
}));

vi.mock('../../src/firebase/client.js', () => ({
  getFirebaseApp: vi.fn(() => ({})),
  getDb: vi.fn(() => ({})),
}));

vi.mock('../../src/firebase/collections.js', () => ({
  issuesCollection: vi.fn(() => ({ path: 'projects/test/issues' })),
  dependenciesCollection: vi.fn(() => ({ path: 'projects/test/deps' })),
  labelsCollection: vi.fn(() => ({ path: 'projects/test/labels' })),
}));

vi.mock('../../src/utils/config.js', () => ({
  getCurrentProjectId: vi.fn(() => 'test-project'),
}));

vi.mock('../../src/models/issue.js', () => ({
  issueConverter: {
    fromFirestore: (snapshot: { data: () => Record<string, unknown> }) => snapshot.data(),
  },
}));

vi.mock('../../src/models/dependency.js', () => ({
  dependencyConverter: {
    fromFirestore: (snapshot: { data: () => Record<string, unknown> }) => snapshot.data(),
  },
}));

// ── Import after mocks ───────────────────────────────────────────────

const { runDoctor } = await import('../../src/commands/doctor.js');

// ── Helpers ──────────────────────────────────────────────────────────

function makeIssueDoc(overrides: Partial<Issue> & { id: string }) {
  const data: Record<string, unknown> = {
    id: overrides.id,
    title: `Issue ${overrides.id}`,
    labels: overrides.labels ?? [],
    parentId: overrides.parentId ?? null,
    status: overrides.status ?? 'open',
    type: overrides.type ?? 'task',
  };
  return { data: () => data };
}

function makeDepDoc(dep: { id: string; fromId: string; toId: string; type?: string }) {
  const data: Record<string, unknown> = {
    id: dep.id,
    fromId: dep.fromId,
    toId: dep.toId,
    type: dep.type ?? 'blocks',
    createdAt: new Date(),
    createdBy: 'test-user',
  };
  return { data: () => data };
}

function makeLabelDoc(name: string) {
  return { data: () => ({ id: `label-${name}`, name, color: '#000', description: '' } as Label) };
}

async function setupDocs(
  issueDocs: ReturnType<typeof makeIssueDoc>[],
  depDocs: ReturnType<typeof makeDepDoc>[],
  labelDocs: ReturnType<typeof makeLabelDoc>[],
) {
  const { getDocs } = await import('firebase/firestore');
  vi.mocked(getDocs)
    .mockResolvedValueOnce({ docs: issueDocs } as any)
    .mockResolvedValueOnce({ docs: depDocs } as any)
    .mockResolvedValueOnce({ docs: labelDocs } as any);
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runDoctor — clean data', () => {
  it('returns empty issues array and fixed=0 when no problems', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-001' }), makeIssueDoc({ id: 'rt-002' })],
      [],
      [makeLabelDoc('bug')],
    );

    const result = await runDoctor(false);

    expect(result.issues).toHaveLength(0);
    expect(result.fixed).toBe(0);
  });
});

describe('runDoctor — orphaned dependencies', () => {
  it('detects dependency referencing a missing issue', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-001' })],
      [makeDepDoc({ id: 'dep-1', fromId: 'rt-missing', toId: 'rt-001' })],
      [],
    );

    const result = await runDoctor(false);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('orphaned_dependency');
    expect(result.issues[0].fixable).toBe(true);
    expect(result.issues[0].id).toBe('dep-1');
  });

  it('calls deleteDoc and increments fixed count in --fix mode', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-001' })],
      [makeDepDoc({ id: 'dep-1', fromId: 'rt-missing', toId: 'rt-001' })],
      [],
    );

    const result = await runDoctor(true);

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(result.fixed).toBe(1);
  });
});

describe('runDoctor — orphaned label references', () => {
  it('detects issue referencing an unknown label', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-001', labels: ['unknown-label'] })],
      [],
      [makeLabelDoc('known')],
    );

    const result = await runDoctor(false);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('orphaned_label_ref');
    expect(result.issues[0].fixable).toBe(true);
  });

  it('calls updateDoc in --fix mode to clean orphaned labels', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-001', labels: ['bad-label', 'known'] })],
      [],
      [makeLabelDoc('known')],
    );

    const result = await runDoctor(true);

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(result.fixed).toBe(1);
  });
});

describe('runDoctor — orphaned parent references', () => {
  it('detects issue with missing parentId', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-001', parentId: 'rt-missing-parent' })],
      [],
      [],
    );

    const result = await runDoctor(false);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('orphaned_parent');
    expect(result.issues[0].fixable).toBe(false);
  });
});

describe('runDoctor — cycle detection', () => {
  it('detects a simple A->B->A cycle', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-a' }), makeIssueDoc({ id: 'rt-b' })],
      [
        makeDepDoc({ id: 'dep-ab', fromId: 'rt-a', toId: 'rt-b' }),
        makeDepDoc({ id: 'dep-ba', fromId: 'rt-b', toId: 'rt-a' }),
      ],
      [],
    );

    const result = await runDoctor(false);

    const cycleIssues = result.issues.filter((i) => i.type === 'cycle');
    expect(cycleIssues.length).toBeGreaterThan(0);
    expect(cycleIssues[0].fixable).toBe(false);
  });

  it('does not report a cycle in a DAG', async () => {
    await setupDocs(
      [makeIssueDoc({ id: 'rt-a' }), makeIssueDoc({ id: 'rt-b' }), makeIssueDoc({ id: 'rt-c' })],
      [
        makeDepDoc({ id: 'dep-ab', fromId: 'rt-a', toId: 'rt-b' }),
        makeDepDoc({ id: 'dep-bc', fromId: 'rt-b', toId: 'rt-c' }),
      ],
      [],
    );

    const result = await runDoctor(false);

    expect(result.issues.filter((i) => i.type === 'cycle')).toHaveLength(0);
  });
});
