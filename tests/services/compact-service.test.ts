import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Issue, Dependency } from '../../src/types/index.js';

// ── Mock Firebase ────────────────────────────────────────────────────

const mockBatchSet = vi.fn();
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
  dependenciesCollection: vi.fn(() => ({ path: 'projects/test/deps' })),
  archivedCollection: vi.fn(() => ({ path: 'projects/test/archived' })),
}));

vi.mock('../../src/utils/config.js', () => ({
  getCurrentProjectId: vi.fn(() => 'test-project'),
}));

vi.mock('../../src/models/issue.js', () => ({
  issueConverter: {
    toFirestore: (issue: Issue) => ({
      ...issue,
      createdAt: { toDate: () => issue.createdAt },
      updatedAt: { toDate: () => issue.updatedAt },
      closedAt: issue.closedAt ? { toDate: () => issue.closedAt } : null,
    }),
    fromFirestore: (snapshot: { data: () => Record<string, unknown> }) => {
      const data = snapshot.data();
      return {
        ...data,
        createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
        updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() ?? new Date(),
        closedAt: data.closedAt ? (data.closedAt as { toDate: () => Date })?.toDate?.() : null,
      } as Issue;
    },
  },
}));

// ── Import after mocks ──────────────────────────────────────────────

const {
  generateSummary,
  parseOlderThan,
  getCompactCandidates,
  compactIssues,
  getArchivedIssue,
} = await import('../../src/services/compact-service.js');

// ── Helpers ──────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<Issue> & { id: string }): Issue {
  const now = new Date();
  return {
    title: `Issue ${overrides.id}`,
    description: '',
    type: 'task',
    status: 'closed',
    priority: 2,
    assignee: null,
    labels: [],
    parentId: null,
    childIndex: null,
    jiraKey: null,
    jiraSyncedAt: null,
    githubNumber: null,
    githubSyncedAt: null,
    githubPrUrl: null,
    githubContentHashAtSync: null,
    deferUntil: null,
    dueAt: null,
    createdAt: now,
    updatedAt: now,
    closedAt: now,
    createdBy: 'test-user',
    contentHash: 'abc123',
    ...overrides,
  };
}

function makeDep(
  fromId: string,
  toId: string,
  type: Dependency['type'] = 'blocks',
): Dependency {
  return {
    id: `dep-${fromId}-${toId}`,
    fromId,
    toId,
    type,
    createdAt: new Date(),
    createdBy: 'test-user',
  };
}

function makeIssueDoc(issue: Issue) {
  return {
    exists: () => true,
    data: () => ({
      ...issue,
      createdAt: { toDate: () => issue.createdAt },
      updatedAt: { toDate: () => issue.updatedAt },
      closedAt: issue.closedAt ? { toDate: () => issue.closedAt } : null,
    }),
    id: issue.id,
  };
}

function makeDepDoc(dep: Dependency) {
  return {
    data: () => dep,
    id: dep.id,
  };
}

// ── beforeEach ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocResult.exists.mockReturnValue(false);
  mockGetDocsResult.docs = [];
  mockBatchCommit.mockResolvedValue(undefined);
});

// ── parseOlderThan ──────────────────────────────────────────────────

describe('parseOlderThan', () => {
  it('parses valid day format', () => {
    expect(parseOlderThan('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseOlderThan('30d')).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parseOlderThan('1d')).toBe(1 * 24 * 60 * 60 * 1000);
    expect(parseOlderThan('90d')).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('throws on invalid format', () => {
    expect(() => parseOlderThan('7')).toThrow('Invalid --older-than format');
    expect(() => parseOlderThan('7w')).toThrow('Invalid --older-than format');
    expect(() => parseOlderThan('abc')).toThrow('Invalid --older-than format');
    expect(() => parseOlderThan('')).toThrow('Invalid --older-than format');
    expect(() => parseOlderThan('d7')).toThrow('Invalid --older-than format');
  });
});

// ── generateSummary ─────────────────────────────────────────────────

describe('generateSummary', () => {
  it('generates basic summary with type, title, status, and date', () => {
    const closedAt = new Date('2026-01-15T12:00:00Z');
    const issue = makeIssue({ id: 'rt-001', title: 'Fix login bug', type: 'bug', closedAt });
    const summary = generateSummary(issue, []);

    expect(summary).toContain("[bug] 'Fix login bug' was closed on 2026-01-15.");
  });

  it('includes first sentence of description', () => {
    const issue = makeIssue({
      id: 'rt-002',
      title: 'Update README',
      description: 'Added installation instructions. Also updated badges.',
      closedAt: new Date('2026-01-10T00:00:00Z'),
    });
    const summary = generateSummary(issue, []);

    expect(summary).toContain('Added installation instructions.');
    expect(summary).not.toContain('Also updated badges');
  });

  it('includes dependency info', () => {
    const issue = makeIssue({
      id: 'rt-003',
      title: 'Auth refactor',
      closedAt: new Date('2026-01-10T00:00:00Z'),
    });
    const deps: Dependency[] = [
      makeDep('rt-003', 'rt-004', 'blocks'),
      makeDep('rt-005', 'rt-003', 'related'),
    ];
    const summary = generateSummary(issue, deps);

    expect(summary).toContain('Dependencies:');
    expect(summary).toContain('rt-004 (blocks)');
    expect(summary).toContain('rt-005 (related)');
  });

  it('handles empty description', () => {
    const issue = makeIssue({
      id: 'rt-004',
      title: 'Quick fix',
      description: '',
      closedAt: new Date('2026-01-10T00:00:00Z'),
    });
    const summary = generateSummary(issue, []);

    expect(summary).toContain("[task] 'Quick fix'");
    // Should not have trailing whitespace or empty fragments
    expect(summary).not.toMatch(/\s{2,}/);
  });

  it('handles missing closedAt gracefully', () => {
    const issue = makeIssue({
      id: 'rt-005',
      title: 'No close date',
      closedAt: null,
    });
    const summary = generateSummary(issue, []);

    expect(summary).toContain('unknown date');
  });

  it('handles description with only whitespace', () => {
    const issue = makeIssue({
      id: 'rt-006',
      title: 'Whitespace desc',
      description: '   ',
      closedAt: new Date('2026-01-10T00:00:00Z'),
    });
    const summary = generateSummary(issue, []);

    // Should not include empty first sentence
    expect(summary).not.toContain('..');
  });
});

// ── getCompactCandidates ─────────────────────────────────────────────

describe('getCompactCandidates', () => {
  it('marks issue as skip:too-recent when closed within the cutoff window', async () => {
    const { getDocs } = await import('firebase/firestore');
    const recentIssue = makeIssue({ id: 'rt-recent', closedAt: new Date() });

    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [makeIssueDoc(recentIssue)] } as any) // closed issues
      .mockResolvedValueOnce({ docs: [] } as any) // all deps
      .mockResolvedValueOnce({ docs: [] } as any); // all issues for open check

    const olderThanMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const candidates = await getCompactCandidates(olderThanMs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].skip).toBe(true);
    expect(candidates[0].skipReason).toBe('too-recent');
  });

  it('marks issue as skip:too-recent when closedAt is null', async () => {
    const { getDocs } = await import('firebase/firestore');
    const noDateIssue = makeIssue({ id: 'rt-nodate', closedAt: null });

    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [makeIssueDoc(noDateIssue)] } as any)
      .mockResolvedValueOnce({ docs: [] } as any)
      .mockResolvedValueOnce({ docs: [] } as any);

    const candidates = await getCompactCandidates(30 * 24 * 60 * 60 * 1000);

    expect(candidates[0].skip).toBe(true);
    expect(candidates[0].skipReason).toBe('too-recent');
  });

  it('marks issue as skip:has-open-dependents when an open issue depends on it', async () => {
    const { getDocs } = await import('firebase/firestore');
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const closedIssue = makeIssue({ id: 'rt-old', closedAt: oldDate });
    const openIssue = makeIssue({ id: 'rt-open', status: 'open' });
    const dep = makeDep('rt-open', 'rt-old'); // open issue blocks old closed issue

    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [makeIssueDoc(closedIssue)] } as any) // closed issues
      .mockResolvedValueOnce({ docs: [makeDepDoc(dep)] } as any) // all deps
      .mockResolvedValueOnce({ docs: [makeIssueDoc(openIssue)] } as any); // all issues

    const candidates = await getCompactCandidates(30 * 24 * 60 * 60 * 1000);

    expect(candidates[0].skip).toBe(true);
    expect(candidates[0].skipReason).toBe('has-open-dependents');
  });

  it('returns skip:false for eligible issue (old enough, no open dependents)', async () => {
    const { getDocs } = await import('firebase/firestore');
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const closedIssue = makeIssue({ id: 'rt-eligible', closedAt: oldDate });

    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [makeIssueDoc(closedIssue)] } as any) // closed issues
      .mockResolvedValueOnce({ docs: [] } as any) // all deps
      .mockResolvedValueOnce({ docs: [] } as any); // all issues

    const candidates = await getCompactCandidates(30 * 24 * 60 * 60 * 1000);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].skip).toBe(false);
    expect(candidates[0].issue.id).toBe('rt-eligible');
  });
});

// ── compactIssues ────────────────────────────────────────────────────

describe('compactIssues', () => {
  it('dry-run returns report without calling batch.commit', async () => {
    const { getDocs } = await import('firebase/firestore');
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const issue = makeIssue({ id: 'rt-dry', closedAt: oldDate });
    const candidates = [{ issue, skip: false }];

    // fetchDepsByIds will call getDocs twice (fromId + toId queries)
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as any) // fromId query
      .mockResolvedValueOnce({ docs: [] } as any); // toId query

    const report = await compactIssues(candidates, false);

    expect(report.dryRun).toBe(true);
    expect(report.compacted).toBe(1);
    expect(report.skipped).toBe(0);
    expect(report.issues[0].reason).toBe('compacted');
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('apply mode calls batch.set twice and batch.commit once per issue', async () => {
    const { getDocs } = await import('firebase/firestore');
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const issue = makeIssue({ id: 'rt-apply', closedAt: oldDate });
    const candidates = [{ issue, skip: false }];

    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as any) // fromId dep query
      .mockResolvedValueOnce({ docs: [] } as any); // toId dep query

    const report = await compactIssues(candidates, true);

    expect(report.dryRun).toBe(false);
    expect(report.compacted).toBe(1);
    // batch.set called twice: once for archive, once for stub
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('returns empty report with zeros for empty candidates', async () => {
    const report = await compactIssues([], true);

    expect(report.matched).toBe(0);
    expect(report.compacted).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.issues).toHaveLength(0);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('includes skipped issues in report', async () => {
    const { getDocs } = await import('firebase/firestore');
    const issue = makeIssue({ id: 'rt-skip' });
    const candidates = [{ issue, skip: true, skipReason: 'too-recent' as const }];

    // No getDocs calls needed for dry run with only skipped issues
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);

    const report = await compactIssues(candidates, false);

    expect(report.skipped).toBe(1);
    expect(report.issues[0].reason).toBe('skipped');
    expect(report.issues[0].skipReason).toBe('too-recent');
  });
});

// ── getArchivedIssue ─────────────────────────────────────────────────

describe('getArchivedIssue', () => {
  it('returns the issue via issueConverter.fromFirestore when document exists', async () => {
    const { getDoc } = await import('firebase/firestore');
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const issue = makeIssue({ id: 'rt-arch', title: 'Archived issue', closedAt: oldDate });

    vi.mocked(getDoc).mockResolvedValueOnce(makeIssueDoc(issue) as any);

    const result = await getArchivedIssue('rt-arch');

    expect(result.id).toBe('rt-arch');
    expect(result.title).toBe('Archived issue');
  });

  it('throws when document does not exist', async () => {
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => ({}),
    } as any);

    await expect(getArchivedIssue('rt-missing')).rejects.toThrow(
      'Archived issue rt-missing not found',
    );
  });
});
