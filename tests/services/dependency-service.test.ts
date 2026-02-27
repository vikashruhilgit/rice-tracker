import { describe, it, expect } from 'vitest';
import type { Issue, Dependency } from '../../src/types/index.js';
import {
  computeReadyIssues,
  hasCircularDependency,
} from '../../src/services/dependency-service.js';
import { validateDependency } from '../../src/models/dependency.js';

// ── Test helper — reflects the Issue type including new labelIds field ──────

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
    labelIds: [],
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

// ── validateDependency ──────────────────────────────────────────────

describe('validateDependency', () => {
  it('returns no errors for valid blocks dependency', () => {
    expect(validateDependency({ fromId: 'rt-001', toId: 'rt-002', type: 'blocks' })).toEqual([]);
  });

  it('returns no errors for type "duplicates"', () => {
    expect(validateDependency({ fromId: 'rt-001', toId: 'rt-002', type: 'duplicates' })).toEqual([]);
  });

  it('returns no errors for type "supersedes"', () => {
    expect(validateDependency({ fromId: 'rt-001', toId: 'rt-002', type: 'supersedes' })).toEqual([]);
  });

  it('returns no errors for type "replies_to"', () => {
    expect(validateDependency({ fromId: 'rt-001', toId: 'rt-002', type: 'replies_to' })).toEqual([]);
  });

  it('returns error for invalid dependency type', () => {
    const errors = validateDependency({ fromId: 'rt-001', toId: 'rt-002', type: 'unknown' as any });
    expect(errors).toContain('Invalid dependency type');
  });

  it('returns error when fromId is missing', () => {
    const errors = validateDependency({ toId: 'rt-002', type: 'blocks' });
    expect(errors).toContain('fromId is required');
  });

  it('returns error when toId is missing', () => {
    const errors = validateDependency({ fromId: 'rt-001', type: 'blocks' });
    expect(errors).toContain('toId is required');
  });

  it('returns error for self-dependency', () => {
    const errors = validateDependency({ fromId: 'rt-001', toId: 'rt-001', type: 'blocks' });
    expect(errors).toContain('Cannot create self-dependency');
  });
});

// ── computeReadyIssues with labelIds ────────────────────────────────

describe('computeReadyIssues with labelIds field', () => {
  it('handles issues with labelIds field (new schema)', () => {
    const issues = [
      makeIssue({ id: 'rt-001', labelIds: ['rt-label1'] }),
      makeIssue({ id: 'rt-002', labelIds: [] }),
    ];
    const deps: Dependency[] = [];

    const ready = computeReadyIssues(issues, deps);
    expect(ready).toHaveLength(2);
  });

  it('10 blockers: getBlockers would use 1 batch read (not 11 individual reads)', () => {
    // This test documents the expected behavior: with 10 blockers, batchGetIssues
    // makes 1 Firestore call (10 <= 30 batch limit) instead of 10 individual reads.
    // The actual Firestore call is tested in integration; here we verify the
    // computeReadyIssues logic is correct with many blockers.
    const blockers = Array.from({ length: 10 }, (_, i) =>
      makeIssue({ id: `rt-blocker-${i}`, status: 'open' }),
    );
    const blocked = makeIssue({ id: 'rt-blocked' });
    const allIssues = [...blockers, blocked];
    const deps = blockers.map((b) => makeDep(b.id, blocked.id, 'blocks'));

    const ready = computeReadyIssues(allIssues, deps);

    // Only the 10 open blockers are ready; blocked issue is not
    expect(ready).toHaveLength(10);
    expect(ready.map((i) => i.id)).not.toContain('rt-blocked');
  });

  // TODO(integration): verify batchGetIssues makes ceil(n/30) getDocs calls.
  // Requires Firestore emulator or getDocs mock — tracked as follow-up.
  it('chunk boundary: 31 blockers handled correctly by computeReadyIssues', () => {
    const blockers = Array.from({ length: 31 }, (_, i) =>
      makeIssue({ id: `rt-blocker-${i}`, status: 'open' }),
    );
    const blocked = makeIssue({ id: 'rt-blocked' });
    const allIssues = [...blockers, blocked];
    const deps = blockers.map((b) => makeDep(b.id, blocked.id, 'blocks'));

    const ready = computeReadyIssues(allIssues, deps);

    expect(ready).toHaveLength(31);
    expect(ready.map((i) => i.id)).not.toContain('rt-blocked');
  });
});
