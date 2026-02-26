import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @octokit/rest ──────────────────────────────────────────────

const mockReposGet = vi.fn();
const mockIssuesCreate = vi.fn();
const mockIssuesUpdate = vi.fn();
const mockIssuesGet = vi.fn();
const mockSearchIssuesAndPullRequests = vi.fn();
const mockPullsGet = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    repos: { get: mockReposGet },
    issues: { create: mockIssuesCreate, update: mockIssuesUpdate, get: mockIssuesGet },
    search: { issuesAndPullRequests: mockSearchIssuesAndPullRequests },
    pulls: { get: mockPullsGet },
  })),
}));

// ── Import after mocks ──────────────────────────────────────────────

const {
  getGithubClient,
  resetGithubClient,
  createGithubIssue,
  searchGithubIssues,
  getGithubPr,
  getGithubIssue,
  validateGithubConnection,
} = await import('../../src/services/github-service.js');

import type { GithubConfig } from '../../src/types/github.js';
import type { Issue } from '../../src/types/index.js';

// ── Helpers ─────────────────────────────────────────────────────────

const config: GithubConfig = { owner: 'test-owner', repo: 'test-repo', token: 'ghp_test123' };

function makeIssue(overrides?: Partial<Issue>): Issue {
  const now = new Date();
  return {
    id: 'rt-abc1',
    title: 'Test issue',
    description: 'A description',
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
    contentHash: 'hash123',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  resetGithubClient();
});

describe('getGithubClient', () => {
  it('returns same instance for same token', () => {
    const c1 = getGithubClient(config);
    const c2 = getGithubClient(config);
    expect(c1).toBe(c2);
  });

  it('returns new instance when token changes', () => {
    const c1 = getGithubClient(config);
    const c2 = getGithubClient({ ...config, token: 'ghp_other' });
    expect(c1).not.toBe(c2);
  });
});

describe('resetGithubClient', () => {
  it('forces new client on next call', () => {
    const c1 = getGithubClient(config);
    resetGithubClient();
    const c2 = getGithubClient(config);
    expect(c1).not.toBe(c2);
  });
});

describe('validateGithubConnection', () => {
  it('returns repo info', async () => {
    mockReposGet.mockResolvedValue({
      data: { owner: { login: 'test-owner' }, name: 'test-repo', full_name: 'test-owner/test-repo' },
    });

    const result = await validateGithubConnection(config);

    expect(result).toEqual({ owner: 'test-owner', repo: 'test-repo', fullName: 'test-owner/test-repo' });
  });
});

describe('createGithubIssue', () => {
  it('returns the created issue number', async () => {
    mockIssuesCreate.mockResolvedValue({ data: { number: 42 } });
    const issue = makeIssue();

    const num = await createGithubIssue(issue, config, ['bug']);

    expect(num).toBe(42);
    expect(mockIssuesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Test issue',
        labels: ['bug'],
      }),
    );
  });
});

describe('getGithubIssue', () => {
  it('returns issue data', async () => {
    const issueData = { number: 5, title: 'GH Issue', state: 'open' };
    mockIssuesGet.mockResolvedValue({ data: issueData });

    const result = await getGithubIssue(5, config);

    expect(result).toEqual(issueData);
  });
});

describe('searchGithubIssues', () => {
  it('filters out pull requests', async () => {
    mockSearchIssuesAndPullRequests.mockResolvedValue({
      data: {
        items: [
          { number: 1, title: 'Issue', labels: [], pull_request: undefined },
          { number: 2, title: 'PR', labels: [], pull_request: { url: 'x' } },
        ],
      },
    });

    const results = await searchGithubIssues(undefined, config);

    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);
  });

  it('passes filter to search query', async () => {
    mockSearchIssuesAndPullRequests.mockResolvedValue({ data: { items: [] } });

    await searchGithubIssues('label:bug', config);

    expect(mockSearchIssuesAndPullRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining('label:bug'),
      }),
    );
  });
});

describe('getGithubPr', () => {
  it('returns PR shape with number, html_url, title', async () => {
    mockPullsGet.mockResolvedValue({
      data: { number: 10, html_url: 'https://github.com/pr/10', title: 'My PR', extra: 'ignored' },
    });

    const result = await getGithubPr(10, config);

    expect(result).toEqual({ number: 10, html_url: 'https://github.com/pr/10', title: 'My PR' });
  });
});
