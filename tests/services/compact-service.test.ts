import { describe, it, expect } from 'vitest';
import type { Issue, Dependency } from '../../src/types/index.js';
import { generateSummary, parseOlderThan } from '../../src/services/compact-service.js';

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
