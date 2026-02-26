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
