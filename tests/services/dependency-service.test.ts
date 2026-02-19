import { describe, it, expect } from 'vitest';
import type { Issue, Dependency } from '../../src/types/index.js';
import {
  computeReadyIssues,
  hasCircularDependency,
} from '../../src/services/dependency-service.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<Issue> & { id: string }): Issue {
  const now = new Date();
  return {
    title: `Issue ${overrides.id}`,
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

// ── computeReadyIssues ──────────────────────────────────────────────

describe('computeReadyIssues', () => {
  it('returns open issues with no blockers', () => {
    const issues = [makeIssue({ id: 'rt-001' }), makeIssue({ id: 'rt-002' })];
    const deps: Dependency[] = [];

    const ready = computeReadyIssues(issues, deps);

    expect(ready).toHaveLength(2);
    expect(ready.map((i) => i.id).sort()).toEqual(['rt-001', 'rt-002']);
  });

  it('excludes closed issues from ready list', () => {
    const issues = [
      makeIssue({ id: 'rt-001' }),
      makeIssue({ id: 'rt-002', status: 'closed', closedAt: new Date() }),
    ];
    const deps: Dependency[] = [];

    const ready = computeReadyIssues(issues, deps);

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('rt-001');
  });

  it('returns issue when its blocker is closed', () => {
    const issues = [
      makeIssue({ id: 'rt-001', status: 'closed', closedAt: new Date() }),
      makeIssue({ id: 'rt-002' }),
    ];
    const deps = [makeDep('rt-001', 'rt-002', 'blocks')];

    const ready = computeReadyIssues(issues, deps);

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('rt-002');
  });

  it('excludes issue when its blocker is open', () => {
    const issues = [
      makeIssue({ id: 'rt-001' }), // open blocker
      makeIssue({ id: 'rt-002' }), // blocked
    ];
    const deps = [makeDep('rt-001', 'rt-002', 'blocks')];

    const ready = computeReadyIssues(issues, deps);

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('rt-001');
  });

  it('handles transitive blocking: A blocks B, B blocks C', () => {
    const issues = [
      makeIssue({ id: 'rt-a' }), // open
      makeIssue({ id: 'rt-b' }), // open, blocked by A
      makeIssue({ id: 'rt-c' }), // open, blocked by B
    ];
    const deps = [
      makeDep('rt-a', 'rt-b', 'blocks'),
      makeDep('rt-b', 'rt-c', 'blocks'),
    ];

    const ready = computeReadyIssues(issues, deps);

    // Only A is ready (B blocked by A, C blocked by B which is blocked by A)
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('rt-a');
  });

  it('marks C as ready when transitive blocker A is closed', () => {
    const issues = [
      makeIssue({ id: 'rt-a', status: 'closed', closedAt: new Date() }),
      makeIssue({ id: 'rt-b', status: 'closed', closedAt: new Date() }),
      makeIssue({ id: 'rt-c' }), // open
    ];
    const deps = [
      makeDep('rt-a', 'rt-b', 'blocks'),
      makeDep('rt-b', 'rt-c', 'blocks'),
    ];

    const ready = computeReadyIssues(issues, deps);

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('rt-c');
  });

  it('C still blocked when transitive A is open but direct B is closed', () => {
    const issues = [
      makeIssue({ id: 'rt-a' }), // open
      makeIssue({ id: 'rt-b', status: 'closed', closedAt: new Date() }),
      makeIssue({ id: 'rt-c' }), // open, blocked by B (closed) but B blocked by A (open)
    ];
    const deps = [
      makeDep('rt-a', 'rt-b', 'blocks'),
      makeDep('rt-b', 'rt-c', 'blocks'),
    ];

    const ready = computeReadyIssues(issues, deps);

    // A is ready (no blockers), C is blocked transitively by A
    expect(ready.map((i) => i.id)).toEqual(['rt-a']);
  });

  it('ignores non-blocks dependency types for ready calculation', () => {
    const issues = [
      makeIssue({ id: 'rt-001' }),
      makeIssue({ id: 'rt-002' }),
    ];
    const deps = [makeDep('rt-001', 'rt-002', 'related')];

    const ready = computeReadyIssues(issues, deps);

    expect(ready).toHaveLength(2);
  });

  it('handles multiple blockers on one issue', () => {
    const issues = [
      makeIssue({ id: 'rt-a', status: 'closed', closedAt: new Date() }),
      makeIssue({ id: 'rt-b' }), // open blocker
      makeIssue({ id: 'rt-c' }), // blocked by both A and B
    ];
    const deps = [
      makeDep('rt-a', 'rt-c', 'blocks'),
      makeDep('rt-b', 'rt-c', 'blocks'),
    ];

    const ready = computeReadyIssues(issues, deps);

    // B is ready, C is not (B is still open)
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('rt-b');
  });

  it('returns empty for no open issues', () => {
    const issues = [
      makeIssue({ id: 'rt-001', status: 'closed', closedAt: new Date() }),
    ];

    const ready = computeReadyIssues(issues, []);

    expect(ready).toHaveLength(0);
  });

  it('includes in_progress issues in ready check', () => {
    const issues = [makeIssue({ id: 'rt-001', status: 'in_progress' })];

    const ready = computeReadyIssues(issues, []);

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('rt-001');
  });
});

// ── hasCircularDependency ───────────────────────────────────────────

describe('hasCircularDependency', () => {
  it('returns false for empty graph', () => {
    expect(hasCircularDependency([], 'a', 'b')).toBe(false);
  });

  it('returns false when no cycle would be created', () => {
    const deps = [makeDep('a', 'b')];
    // Adding b -> c would not create a cycle
    expect(hasCircularDependency(deps, 'b', 'c')).toBe(false);
  });

  it('detects direct cycle: a->b exists, adding b->a', () => {
    const deps = [makeDep('a', 'b')];
    expect(hasCircularDependency(deps, 'b', 'a')).toBe(true);
  });

  it('detects indirect cycle: a->b->c exists, adding c->a', () => {
    const deps = [makeDep('a', 'b'), makeDep('b', 'c')];
    expect(hasCircularDependency(deps, 'c', 'a')).toBe(true);
  });

  it('returns false for unrelated subgraph', () => {
    const deps = [makeDep('a', 'b'), makeDep('c', 'd')];
    // Adding d -> a would not create cycle (a->b and c->d are separate)
    expect(hasCircularDependency(deps, 'd', 'a')).toBe(false);
  });

  it('detects cycle in longer chain', () => {
    const deps = [
      makeDep('a', 'b'),
      makeDep('b', 'c'),
      makeDep('c', 'd'),
    ];
    expect(hasCircularDependency(deps, 'd', 'a')).toBe(true);
  });

  it('handles diamond without false positive', () => {
    // a -> b, a -> c, b -> d, c -> d
    const deps = [
      makeDep('a', 'b'),
      makeDep('a', 'c'),
      makeDep('b', 'd'),
      makeDep('c', 'd'),
    ];
    // Adding e -> a should not be a cycle
    expect(hasCircularDependency(deps, 'e', 'a')).toBe(false);
    // Adding d -> a WOULD be a cycle
    expect(hasCircularDependency(deps, 'd', 'a')).toBe(true);
  });
});
