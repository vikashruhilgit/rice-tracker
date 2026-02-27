import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Issue } from '../../src/types/index.js';

// ── Mock service and utils ───────────────────────────────────────────

vi.mock('../../src/services/issue-service.js', () => ({
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  listIssues: vi.fn(),
}));

vi.mock('../../src/utils/config.js', () => ({
  getCurrentProjectId: vi.fn(() => 'test-project'),
  getTimezone: vi.fn(() => 'UTC'),
}));

vi.mock('../../src/utils/formatter.js', () => ({
  formatIssueDetail: vi.fn(() => 'detail output'),
  formatIssueTable: vi.fn(() => 'table output'),
  outputResult: vi.fn(),
}));

// ── Import after mocks ───────────────────────────────────────────────

const { createIssue, getIssue, listIssues } = await import('../../src/services/issue-service.js');
const { decisionCommand } = await import('../../src/commands/decision.js');

// ── Helpers ──────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<Issue> & { id: string }): Issue {
  const now = new Date();
  return {
    id: overrides.id,
    title: overrides.title ?? `Issue ${overrides.id}`,
    description: '',
    type: overrides.type ?? 'task',
    status: 'open',
    priority: 2,
    assignee: null,
    labels: [],
    parentId: null,
    childIndex: null,
    jiraKey: null,
    jiraSyncedAt: null,
    deferUntil: null,
    dueAt: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    createdBy: 'test-user',
    contentHash: 'abc123',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('decision create', () => {
  it('calls createIssue with type "decision"', async () => {
    const issue = makeIssue({ id: 'rt-dec1', type: 'decision', title: 'Use PostgreSQL' });
    vi.mocked(createIssue).mockResolvedValueOnce(issue);

    await decisionCommand.parseAsync(['node', 'rt', 'create', 'Use PostgreSQL']);

    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Use PostgreSQL', type: 'decision' }),
    );
  });

  it('passes priority and assignee options to createIssue', async () => {
    const issue = makeIssue({ id: 'rt-dec2', type: 'decision' });
    vi.mocked(createIssue).mockResolvedValueOnce(issue);

    await decisionCommand.parseAsync([
      'node', 'rt', 'create', 'ADR 001', '-p', '0', '-a', 'alice',
    ]);

    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'decision', priority: 0, assignee: 'alice' }),
    );
  });
});

describe('decision list', () => {
  it('calls listIssues with type filter "decision"', async () => {
    vi.mocked(listIssues).mockResolvedValueOnce([]);

    await decisionCommand.parseAsync(['node', 'rt', 'list']);

    expect(listIssues).toHaveBeenCalledWith({ type: 'decision' });
  });

  it('filters out non-decision issues by using the type filter', async () => {
    const decisions = [makeIssue({ id: 'rt-d1', type: 'decision' })];
    vi.mocked(listIssues).mockResolvedValueOnce(decisions);

    await decisionCommand.parseAsync(['node', 'rt', 'list']);

    expect(listIssues).toHaveBeenCalledWith({ type: 'decision' });
  });
});

describe('decision show', () => {
  it('prints error and exits when issue type is not "decision"', async () => {
    const taskIssue = makeIssue({ id: 'rt-task1', type: 'task' });
    vi.mocked(getIssue).mockResolvedValueOnce(taskIssue);

    await decisionCommand.parseAsync(['node', 'rt', 'show', 'rt-task1']);

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('not a decision'),
    );
  });

  it('shows detail without error for a decision issue', async () => {
    const decisionIssue = makeIssue({ id: 'rt-dec1', type: 'decision' });
    vi.mocked(getIssue).mockResolvedValueOnce(decisionIssue);

    await decisionCommand.parseAsync(['node', 'rt', 'show', 'rt-dec1']);

    expect(process.exit).not.toHaveBeenCalled();
  });
});
