/**
 * MCP tool handler tests.
 *
 * Tests validate that:
 * 1. Tool handlers call the correct service functions
 * 2. Successful responses include { content: [{ type: 'text', text: JSON }] }
 * 3. Service errors are caught and returned as { isError: true }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Issue } from '../../src/types/index.js';

// ── Service mocks ─────────────────────────────────────────────────────────────

vi.mock('../../src/services/issue-service.js', () => ({
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  listIssues: vi.fn(),
  updateIssue: vi.fn(),
  closeIssue: vi.fn(),
}));

vi.mock('../../src/services/dependency-service.js', () => ({
  addDependency: vi.fn(),
  getReadyIssues: vi.fn(),
}));

vi.mock('../../src/firebase/auth.js', () => ({
  getCurrentUserId: vi.fn().mockReturnValue('test-user'),
}));

vi.mock('../../src/utils/config.js', () => ({
  getCurrentProjectId: vi.fn().mockReturnValue('test-project'),
}));

vi.mock('../../src/utils/id-generator.js', () => ({
  generateId: vi.fn().mockReturnValue('rt-test1'),
}));

// Mock firebase/firestore for comment/label operations
vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue({}),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  query: vi.fn().mockReturnValue({}),
  where: vi.fn().mockReturnValue({}),
  orderBy: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/firebase/collections.js', () => ({
  commentsCollection: vi.fn().mockReturnValue({}),
  labelsCollection: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/models/comment.js', () => ({
  commentConverter: {
    toFirestore: vi.fn((c) => c),
    fromFirestore: vi.fn((d) => d.data()),
  },
}));

vi.mock('../../src/models/label.js', () => ({
  validateLabel: vi.fn().mockReturnValue([]),
  labelConverter: {
    toFirestore: vi.fn((l) => l),
    fromFirestore: vi.fn((d) => d.data()),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIssue(overrides?: Partial<Issue>): Issue {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'rt-a1b2',
    title: 'Test issue',
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

async function buildTestServer() {
  const { registerIssueTools } = await import('../../src/mcp/tools/issues.js');
  const { registerDepsTools } = await import('../../src/mcp/tools/deps.js');
  const { registerCommentTools } = await import('../../src/mcp/tools/comments.js');
  const { registerLabelTools } = await import('../../src/mcp/tools/labels.js');
  const { registerExportTool } = await import('../../src/mcp/tools/export.js');

  const server = new McpServer({ name: 'rt-test', version: '0.0.1' });
  registerIssueTools(server);
  registerDepsTools(server);
  registerCommentTools(server);
  registerLabelTools(server);
  registerExportTool(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.1' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

function parseText(result: { content: { type: string; text?: string }[] }) {
  const textBlock = result.content.find((c) => c.type === 'text');
  return JSON.parse(textBlock?.text ?? 'null');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MCP tool: rt_create_issue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls createIssue and returns issue JSON', async () => {
    const { createIssue } = await import('../../src/services/issue-service.js');
    const mockIssue = makeIssue({ title: 'New task' });
    vi.mocked(createIssue).mockResolvedValue(mockIssue);

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_create_issue', arguments: { title: 'New task' } });

    expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task' }));
    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.id).toBe('rt-a1b2');
    expect(parsed.title).toBe('New task');
  });

  it('returns isError on service failure', async () => {
    const { createIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(createIssue).mockRejectedValue(new Error('Firebase unavailable'));

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_create_issue', arguments: { title: 'Fail' } }) as {
      isError?: boolean;
      content: { type: string; text?: string }[];
    };

    expect(result.isError).toBe(true);
    const parsed = parseText(result);
    expect(parsed.error).toContain('Firebase unavailable');
  });
});

describe('MCP tool: rt_list_issues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns array of issues', async () => {
    const { listIssues } = await import('../../src/services/issue-service.js');
    vi.mocked(listIssues).mockResolvedValue([makeIssue(), makeIssue({ id: 'rt-c3d4', title: 'Second' })]);

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_list_issues', arguments: {} });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('passes status filter to service', async () => {
    const { listIssues } = await import('../../src/services/issue-service.js');
    vi.mocked(listIssues).mockResolvedValue([]);

    const { client } = await buildTestServer();
    await client.callTool({ name: 'rt_list_issues', arguments: { status: 'closed' } });

    expect(listIssues).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
  });
});

describe('MCP tool: rt_get_issue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns issue JSON for valid ID', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(getIssue).mockResolvedValue(makeIssue());

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_get_issue', arguments: { id: 'rt-a1b2' } });

    expect(getIssue).toHaveBeenCalledWith('rt-a1b2');
    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.id).toBe('rt-a1b2');
  });

  it('returns isError when issue not found', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(getIssue).mockRejectedValue(new Error('Issue rt-xxxx not found'));

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_get_issue', arguments: { id: 'rt-xxxx' } }) as {
      isError?: boolean;
      content: { type: string; text?: string }[];
    };

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool: rt_update_issue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateIssue with only provided fields', async () => {
    const { getIssue, updateIssue } = await import('../../src/services/issue-service.js');
    const original = makeIssue();
    vi.mocked(getIssue).mockResolvedValue(original);
    vi.mocked(updateIssue).mockResolvedValue({ ...original, title: 'Updated' });

    const { client } = await buildTestServer();
    await client.callTool({ name: 'rt_update_issue', arguments: { id: 'rt-a1b2', title: 'Updated' } });

    expect(updateIssue).toHaveBeenCalledWith('rt-a1b2', expect.objectContaining({ title: 'Updated' }));
    // assignee was not in args, should not be in updates
    const [, updates] = vi.mocked(updateIssue).mock.calls[0];
    expect(updates).not.toHaveProperty('type');
  });
});

describe('MCP tool: rt_close_issue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls closeIssue and returns closed issue', async () => {
    const { closeIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(closeIssue).mockResolvedValue(makeIssue({ status: 'closed' }));

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_close_issue', arguments: { id: 'rt-a1b2' } });

    expect(closeIssue).toHaveBeenCalledWith('rt-a1b2');
    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.status).toBe('closed');
  });
});

describe('MCP tool: rt_add_dependency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls addDependency with from, to, and type', async () => {
    const { addDependency } = await import('../../src/services/dependency-service.js');
    const dep = { id: 'dep-1', fromId: 'rt-a1', toId: 'rt-b2', type: 'blocks', createdAt: new Date(), createdBy: 'u' };
    vi.mocked(addDependency).mockResolvedValue(dep);

    const { client } = await buildTestServer();
    await client.callTool({ name: 'rt_add_dependency', arguments: { from: 'rt-a1', to: 'rt-b2' } });

    expect(addDependency).toHaveBeenCalledWith('rt-a1', 'rt-b2', undefined);
  });
});

describe('MCP tool: rt_get_ready_issues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ready issues array', async () => {
    const { getReadyIssues } = await import('../../src/services/dependency-service.js');
    vi.mocked(getReadyIssues).mockResolvedValue([makeIssue()]);

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_get_ready_issues', arguments: {} });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });
});

describe('MCP tool: rt_export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all issues as JSON array', async () => {
    const { listIssues } = await import('../../src/services/issue-service.js');
    vi.mocked(listIssues).mockResolvedValue([makeIssue(), makeIssue({ id: 'rt-c3d4' })]);

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_export', arguments: {} });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });
});

describe('MCP tool: rt_add_comment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a comment and returns comment JSON', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    const { setDoc } = await import('firebase/firestore');
    vi.mocked(getIssue).mockResolvedValue(makeIssue());
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_add_comment',
      arguments: { issueId: 'rt-a1b2', body: 'Hello' },
    });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.issueId).toBe('rt-a1b2');
    expect(parsed.body).toBe('Hello');
    expect(parsed.thread).toBeNull();
  });

  it('passes thread ID when provided', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    const { setDoc } = await import('firebase/firestore');
    vi.mocked(getIssue).mockResolvedValue(makeIssue());
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_add_comment',
      arguments: { issueId: 'rt-a1b2', body: 'Reply', thread: 'cmt-parent' },
    });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.thread).toBe('cmt-parent');
  });

  it('returns isError when issue not found', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(getIssue).mockRejectedValue(new Error('Issue not found'));

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_add_comment',
      arguments: { issueId: 'rt-xxxx', body: 'Hi' },
    }) as { isError?: boolean; content: { type: string; text?: string }[] };

    expect(result.isError).toBe(true);
    expect(parseText(result).error).toContain('Issue not found');
  });
});

describe('MCP tool: rt_list_comments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns array of comments for an issue', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    const { getDocs } = await import('firebase/firestore');
    const { commentConverter } = await import('../../src/models/comment.js');

    vi.mocked(getIssue).mockResolvedValue(makeIssue());
    const fakeComment = { id: 'cmt-1', issueId: 'rt-a1b2', body: 'Hi', createdAt: new Date(), createdBy: 'u', thread: null };
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{ data: () => fakeComment }],
    } as unknown as ReturnType<typeof getDocs>);
    vi.mocked(commentConverter.fromFirestore).mockReturnValue(fakeComment as unknown as ReturnType<typeof commentConverter.fromFirestore>);

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_list_comments', arguments: { issueId: 'rt-a1b2' } });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it('returns isError when issue not found', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(getIssue).mockRejectedValue(new Error('Issue not found'));

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_list_comments',
      arguments: { issueId: 'rt-xxxx' },
    }) as { isError?: boolean; content: { type: string; text?: string }[] };

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool: rt_create_label', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a label and returns label JSON', async () => {
    const { getDocs, setDoc } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValue({ docs: [], empty: true } as unknown as ReturnType<typeof getDocs>);
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_create_label',
      arguments: { name: 'bug', color: '#ff0000' },
    });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.name).toBe('bug');
    expect(parsed.color).toBe('#ff0000');
  });

  it('returns isError when label already exists', async () => {
    const { getDocs } = await import('firebase/firestore');
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{}],
      empty: false,
    } as unknown as ReturnType<typeof getDocs>);

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_create_label',
      arguments: { name: 'bug' },
    }) as { isError?: boolean; content: { type: string; text?: string }[] };

    expect(result.isError).toBe(true);
    expect(parseText(result).error).toContain('already exists');
  });
});

describe('MCP tool: rt_list_labels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns array of labels', async () => {
    const { getDocs } = await import('firebase/firestore');
    const { labelConverter } = await import('../../src/models/label.js');
    const fakeLabel = { id: 'lbl-1', name: 'bug', color: '#ff0000', description: '' };
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{ data: () => fakeLabel }],
    } as unknown as ReturnType<typeof getDocs>);
    vi.mocked(labelConverter.fromFirestore).mockReturnValue(fakeLabel as unknown as ReturnType<typeof labelConverter.fromFirestore>);

    const { client } = await buildTestServer();
    const result = await client.callTool({ name: 'rt_list_labels', arguments: {} });

    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('bug');
  });

  it('returns isError on service failure', async () => {
    const { getDocs } = await import('firebase/firestore');
    vi.mocked(getDocs).mockRejectedValue(new Error('Firestore unavailable'));

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_list_labels',
      arguments: {},
    }) as { isError?: boolean; content: { type: string; text?: string }[] };

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool: rt_add_label_to_issue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds label and returns updated issue', async () => {
    const { getIssue, updateIssue } = await import('../../src/services/issue-service.js');
    const issue = makeIssue({ labels: [] });
    vi.mocked(getIssue).mockResolvedValue(issue);
    vi.mocked(updateIssue).mockResolvedValue({ ...issue, labels: ['bug'] });

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_add_label_to_issue',
      arguments: { issueId: 'rt-a1b2', labelName: 'bug' },
    });

    expect(updateIssue).toHaveBeenCalledWith('rt-a1b2', { labels: ['bug'] });
    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.labels).toContain('bug');
  });

  it('returns isError when label already on issue', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(getIssue).mockResolvedValue(makeIssue({ labels: ['bug'] }));

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_add_label_to_issue',
      arguments: { issueId: 'rt-a1b2', labelName: 'bug' },
    }) as { isError?: boolean; content: { type: string; text?: string }[] };

    expect(result.isError).toBe(true);
    expect(parseText(result).error).toContain('already has label');
  });
});

describe('MCP tool: rt_remove_label_from_issue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes label and returns updated issue', async () => {
    const { getIssue, updateIssue } = await import('../../src/services/issue-service.js');
    const issue = makeIssue({ labels: ['bug', 'urgent'] });
    vi.mocked(getIssue).mockResolvedValue(issue);
    vi.mocked(updateIssue).mockResolvedValue({ ...issue, labels: ['urgent'] });

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_remove_label_from_issue',
      arguments: { issueId: 'rt-a1b2', labelName: 'bug' },
    });

    expect(updateIssue).toHaveBeenCalledWith('rt-a1b2', { labels: ['urgent'] });
    const parsed = parseText(result as { content: { type: string; text?: string }[] });
    expect(parsed.labels).not.toContain('bug');
  });

  it('returns isError when label not on issue', async () => {
    const { getIssue } = await import('../../src/services/issue-service.js');
    vi.mocked(getIssue).mockResolvedValue(makeIssue({ labels: [] }));

    const { client } = await buildTestServer();
    const result = await client.callTool({
      name: 'rt_remove_label_from_issue',
      arguments: { issueId: 'rt-a1b2', labelName: 'missing' },
    }) as { isError?: boolean; content: { type: string; text?: string }[] };

    expect(result.isError).toBe(true);
    expect(parseText(result).error).toContain('does not have label');
  });
});
