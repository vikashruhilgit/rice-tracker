import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Issue, Priority, IssueType } from '../../src/types/index.js';

// ── Mock services ───────────────────────────────────────────────────

const mockGetIssue = vi.fn();
const mockCreateIssue = vi.fn();
const mockUpdateIssue = vi.fn();
const mockUpdateIssueGithubFields = vi.fn();
const mockListIssues = vi.fn();

vi.mock('../../src/services/issue-service.js', () => ({
  getIssue: (...args: unknown[]) => mockGetIssue(...args),
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
  updateIssue: (...args: unknown[]) => mockUpdateIssue(...args),
  updateIssueGithubFields: (...args: unknown[]) => mockUpdateIssueGithubFields(...args),
  listIssues: (...args: unknown[]) => mockListIssues(...args),
}));

const mockCreateGithubIssue = vi.fn();
const mockUpdateGithubIssue = vi.fn();
const mockSearchGithubIssues = vi.fn();

vi.mock('../../src/services/github-service.js', () => ({
  createGithubIssue: (...args: unknown[]) => mockCreateGithubIssue(...args),
  updateGithubIssue: (...args: unknown[]) => mockUpdateGithubIssue(...args),
  searchGithubIssues: (...args: unknown[]) => mockSearchGithubIssues(...args),
}));

vi.mock('../../src/utils/config.js', () => ({
  getGithubConfig: vi.fn(() => ({ owner: 'o', repo: 'r', token: 't' })),
  getCurrentProjectId: vi.fn(() => 'test-project'),
}));

// ── Import after mocks ──────────────────────────────────────────────

const { pushToGithub, pullFromGithub } = await import('../../src/services/github-sync-service.js');

// We also need to test the non-exported helpers indirectly. Import the module
// to access buildLabels / parsePriorityFromLabels / parseTypeFromLabels via pull/push behaviour.

// ── Helpers ─────────────────────────────────────────────────────────

function makeIssue(overrides?: Partial<Issue>): Issue {
  const now = new Date();
  return {
    id: 'rt-test1',
    title: 'Test issue',
    description: 'desc',
    type: 'task',
    status: 'open',
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
    closedAt: null,
    createdBy: 'test-user',
    contentHash: 'abcdef0123456789',
    ...overrides,
  };
}

function makeGhIssue(overrides?: Record<string, unknown>) {
  return {
    number: 1,
    title: 'GH Issue',
    body: 'GH body',
    state: 'open',
    labels: [],
    pull_request: undefined,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateIssueGithubFields.mockResolvedValue(undefined);
  mockUpdateIssue.mockResolvedValue(makeIssue());
});

describe('pushToGithub', () => {
  it('creates a new GitHub issue when no githubNumber', async () => {
    const issue = makeIssue();
    mockGetIssue.mockResolvedValue(issue);
    mockCreateGithubIssue.mockResolvedValue(42);

    const result = await pushToGithub('rt-test1');

    expect(result.action).toBe('created');
    expect(result.githubNumber).toBe(42);
    expect(mockCreateGithubIssue).toHaveBeenCalledTimes(1);
    expect(mockUpdateIssueGithubFields).toHaveBeenCalledWith(
      'rt-test1', 42, expect.any(Date), issue.contentHash,
    );
  });

  it('updates existing GitHub issue when githubNumber exists', async () => {
    const issue = makeIssue({ githubNumber: 10 });
    mockGetIssue.mockResolvedValue(issue);

    const result = await pushToGithub('rt-test1');

    expect(result.action).toBe('updated');
    expect(result.githubNumber).toBe(10);
    expect(mockUpdateGithubIssue).toHaveBeenCalledTimes(1);
    expect(mockUpdateIssueGithubFields).toHaveBeenCalledWith(
      'rt-test1', 10, expect.any(Date), issue.contentHash,
    );
  });

  it('passes labels including priority, type, and status', async () => {
    const issue = makeIssue({ priority: 0, type: 'bug', status: 'in_progress', labels: ['custom'] });
    mockGetIssue.mockResolvedValue(issue);
    mockCreateGithubIssue.mockResolvedValue(1);

    await pushToGithub('rt-test1');

    const labelsArg = mockCreateGithubIssue.mock.calls[0][2] as string[];
    expect(labelsArg).toContain('rt:priority:P0');
    expect(labelsArg).toContain('bug');
    expect(labelsArg).toContain('rt:in-progress');
    expect(labelsArg).toContain('custom');
  });
});

describe('pullFromGithub', () => {
  it('creates new rt issue for unknown GitHub number', async () => {
    mockListIssues.mockResolvedValue([]);
    mockSearchGithubIssues.mockResolvedValue([makeGhIssue({ number: 5 })]);
    const newIssue = makeIssue({ id: 'rt-new1' });
    mockCreateIssue.mockResolvedValue(newIssue);

    const summary = await pullFromGithub();

    expect(summary.created).toBe(1);
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'GH Issue', description: 'GH body' }),
    );
    expect(mockUpdateIssueGithubFields).toHaveBeenCalledWith(
      'rt-new1', 5, expect.any(Date), newIssue.contentHash,
    );
  });

  it('updates existing rt issue when no conflict', async () => {
    const existing = makeIssue({
      id: 'rt-exist',
      githubNumber: 10,
      contentHash: 'hash_a',
      githubContentHashAtSync: 'hash_a', // same = no local changes
    });
    mockListIssues.mockResolvedValue([existing]);
    mockSearchGithubIssues.mockResolvedValue([makeGhIssue({ number: 10, title: 'Updated from GH' })]);

    const summary = await pullFromGithub();

    expect(summary.updated).toBe(1);
    expect(mockUpdateIssue).toHaveBeenCalledWith(
      'rt-exist',
      expect.objectContaining({ title: 'Updated from GH' }),
    );
  });

  it('skips issue with local modifications (conflict detection)', async () => {
    const existing = makeIssue({
      id: 'rt-conflict',
      githubNumber: 10,
      contentHash: 'hash_modified', // locally changed
      githubContentHashAtSync: 'hash_original', // snapshot from last sync
    });
    mockListIssues.mockResolvedValue([existing]);
    mockSearchGithubIssues.mockResolvedValue([makeGhIssue({ number: 10 })]);

    const summary = await pullFromGithub();

    expect(summary.skipped).toBe(1);
    expect(summary.conflicts).toHaveLength(1);
    expect(summary.conflicts[0].reason).toContain('modified since last sync');
    expect(mockUpdateIssue).not.toHaveBeenCalled();
  });

  it('overrides conflict when force=true', async () => {
    const existing = makeIssue({
      id: 'rt-conflict',
      githubNumber: 10,
      contentHash: 'hash_modified',
      githubContentHashAtSync: 'hash_original',
    });
    mockListIssues.mockResolvedValue([existing]);
    mockSearchGithubIssues.mockResolvedValue([makeGhIssue({ number: 10 })]);

    const summary = await pullFromGithub(undefined, true);

    expect(summary.updated).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(mockUpdateIssue).toHaveBeenCalled();
  });

  it('allows update when githubContentHashAtSync is null (never synced snapshot)', async () => {
    const existing = makeIssue({
      id: 'rt-legacy',
      githubNumber: 10,
      contentHash: 'any_hash',
      githubContentHashAtSync: null, // no snapshot yet
    });
    mockListIssues.mockResolvedValue([existing]);
    mockSearchGithubIssues.mockResolvedValue([makeGhIssue({ number: 10 })]);

    const summary = await pullFromGithub();

    expect(summary.updated).toBe(1);
    expect(summary.skipped).toBe(0);
  });

  it('strips rt sync footer from GitHub body', async () => {
    mockListIssues.mockResolvedValue([]);
    mockSearchGithubIssues.mockResolvedValue([
      makeGhIssue({
        number: 7,
        body: 'Real description\n\n---\n_Synced from rice-tracker issue `rt-abc`_',
      }),
    ]);
    mockCreateIssue.mockResolvedValue(makeIssue());

    await pullFromGithub();

    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Real description' }),
    );
  });

  it('parses priority from labels', async () => {
    mockListIssues.mockResolvedValue([]);
    mockSearchGithubIssues.mockResolvedValue([
      makeGhIssue({ number: 8, labels: [{ name: 'rt:priority:P0' }] }),
    ]);
    mockCreateIssue.mockResolvedValue(makeIssue());

    await pullFromGithub();

    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 0 }),
    );
  });

  it('parses type from labels', async () => {
    mockListIssues.mockResolvedValue([]);
    mockSearchGithubIssues.mockResolvedValue([
      makeGhIssue({ number: 9, labels: [{ name: 'bug' }] }),
    ]);
    mockCreateIssue.mockResolvedValue(makeIssue());

    await pullFromGithub();

    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bug' }),
    );
  });
});
