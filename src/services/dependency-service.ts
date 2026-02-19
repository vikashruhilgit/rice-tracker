import {
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { Dependency, DependencyType, Issue } from '../types/index.js';
import { dependenciesCollection, issuesCollection } from '../firebase/collections.js';
import { getCurrentUserId } from '../firebase/auth.js';
import { generateId } from '../utils/id-generator.js';
import { getCurrentProjectId } from '../utils/config.js';
import { validateDependency, dependencyConverter } from '../models/dependency.js';
import { getIssue } from './issue-service.js';
import { issueConverter } from '../models/issue.js';

// ── Pure graph functions (exported for testing) ──────────────────────

/**
 * Compute which issues are "ready": open issues with no unresolved blockers.
 * A blocker is transitive: if A blocks B and B blocks C, then C is not ready
 * while A is open.
 */
export function computeReadyIssues(issues: Issue[], dependencies: Dependency[]): Issue[] {
  const openIssues = issues.filter((i) => i.status !== 'closed');
  const closedIds = new Set(issues.filter((i) => i.status === 'closed').map((i) => i.id));
  const openIds = new Set(openIssues.map((i) => i.id));

  // Build a map: toId -> [fromId] for 'blocks' dependencies.
  // "fromId blocks toId" means toId is blocked by fromId.
  const blocksEdges = dependencies.filter((d) => d.type === 'blocks');
  const blockedByMap = new Map<string, Set<string>>();
  for (const dep of blocksEdges) {
    if (!blockedByMap.has(dep.toId)) {
      blockedByMap.set(dep.toId, new Set());
    }
    blockedByMap.get(dep.toId)!.add(dep.fromId);
  }

  // For each open issue, check if all transitive blockers are closed.
  // We use BFS from the issue upward through the blocker chain.
  function hasUnresolvedBlocker(issueId: string): boolean {
    const visited = new Set<string>();
    const queue = [issueId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const blockers = blockedByMap.get(current);
      if (!blockers) continue;

      for (const blockerId of blockers) {
        if (visited.has(blockerId)) continue;
        visited.add(blockerId);

        // If this blocker is open (not closed), then the issue is blocked
        if (!closedIds.has(blockerId)) {
          return true;
        }

        // Even if the blocker is closed, check its own blockers transitively
        queue.push(blockerId);
      }
    }

    return false;
  }

  return openIssues.filter((issue) => !hasUnresolvedBlocker(issue.id));
}

/**
 * Detect if adding a dependency fromId->toId would create a cycle.
 * Uses BFS: starting from toId, follow existing edges to see if we reach fromId.
 */
export function hasCircularDependency(
  dependencies: Dependency[],
  fromId: string,
  toId: string,
): boolean {
  // Build adjacency: fromId -> [toId] (all dependency types)
  const adjMap = new Map<string, Set<string>>();
  for (const dep of dependencies) {
    if (!adjMap.has(dep.fromId)) {
      adjMap.set(dep.fromId, new Set());
    }
    adjMap.get(dep.fromId)!.add(dep.toId);
  }

  // BFS from toId: can we reach fromId?
  const visited = new Set<string>();
  const queue = [toId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === fromId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjMap.get(current);
    if (neighbors) {
      for (const n of neighbors) {
        queue.push(n);
      }
    }
  }

  return false;
}

// ── Firestore-backed service functions ───────────────────────────────

export async function addDependency(
  fromId: string,
  toId: string,
  type: DependencyType = 'blocks',
): Promise<Dependency> {
  const projectId = getCurrentProjectId();
  const userId = getCurrentUserId();

  // Validate input
  const errors = validateDependency({ fromId, toId, type });
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  // Verify both issues exist
  await getIssue(fromId);
  await getIssue(toId);

  // Check for circular dependency
  const colRef = dependenciesCollection(projectId);
  const allDepsSnapshot = await getDocs(colRef);
  const allDeps = allDepsSnapshot.docs.map((d) => dependencyConverter.fromFirestore(d));

  if (hasCircularDependency(allDeps, fromId, toId)) {
    throw new Error(`Adding dependency ${fromId} -> ${toId} would create a circular dependency`);
  }

  // Check for duplicate
  const existingQuery = query(
    colRef,
    where('fromId', '==', fromId),
    where('toId', '==', toId),
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    throw new Error(`Dependency from ${fromId} to ${toId} already exists`);
  }

  const id = generateId();
  const now = new Date();

  const dependency: Dependency = {
    id,
    fromId,
    toId,
    type,
    createdAt: now,
    createdBy: userId,
  };

  const docRef = doc(colRef, id);
  await setDoc(docRef, dependencyConverter.toFirestore(dependency));

  return dependency;
}

export async function removeDependency(fromId: string, toId: string): Promise<void> {
  const projectId = getCurrentProjectId();
  const colRef = dependenciesCollection(projectId);

  const q = query(
    colRef,
    where('fromId', '==', fromId),
    where('toId', '==', toId),
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error(`No dependency found from ${fromId} to ${toId}`);
  }

  for (const docSnap of snapshot.docs) {
    await deleteDoc(doc(colRef, docSnap.id));
  }
}

export async function getDependencies(issueId: string): Promise<Dependency[]> {
  const projectId = getCurrentProjectId();
  const colRef = dependenciesCollection(projectId);

  // Get deps where issueId is the source
  const fromQuery = query(colRef, where('fromId', '==', issueId));
  const fromSnap = await getDocs(fromQuery);
  const fromDeps = fromSnap.docs.map((d) => dependencyConverter.fromFirestore(d));

  // Get deps where issueId is the target
  const toQuery = query(colRef, where('toId', '==', issueId));
  const toSnap = await getDocs(toQuery);
  const toDeps = toSnap.docs.map((d) => dependencyConverter.fromFirestore(d));

  return [...fromDeps, ...toDeps];
}

export async function getBlockers(issueId: string): Promise<Issue[]> {
  const projectId = getCurrentProjectId();
  const colRef = dependenciesCollection(projectId);

  // "blocks" deps where toId === issueId means fromId blocks issueId
  const q = query(
    colRef,
    where('toId', '==', issueId),
    where('type', '==', 'blocks'),
  );
  const snapshot = await getDocs(q);
  const deps = snapshot.docs.map((d) => dependencyConverter.fromFirestore(d));

  const blockerIssues: Issue[] = [];
  for (const dep of deps) {
    const issue = await getIssue(dep.fromId);
    blockerIssues.push(issue);
  }
  return blockerIssues;
}

export async function getBlocking(issueId: string): Promise<Issue[]> {
  const projectId = getCurrentProjectId();
  const colRef = dependenciesCollection(projectId);

  // "blocks" deps where fromId === issueId means issueId blocks toId
  const q = query(
    colRef,
    where('fromId', '==', issueId),
    where('type', '==', 'blocks'),
  );
  const snapshot = await getDocs(q);
  const deps = snapshot.docs.map((d) => dependencyConverter.fromFirestore(d));

  const blockedIssues: Issue[] = [];
  for (const dep of deps) {
    const issue = await getIssue(dep.toId);
    blockedIssues.push(issue);
  }
  return blockedIssues;
}

export async function getReadyIssues(): Promise<Issue[]> {
  const projectId = getCurrentProjectId();

  // Fetch all issues
  const issueColRef = issuesCollection(projectId);
  const issueSnap = await getDocs(issueColRef);
  const allIssues = issueSnap.docs.map((d) => issueConverter.fromFirestore(d));

  // Fetch all dependencies
  const depColRef = dependenciesCollection(projectId);
  const depSnap = await getDocs(depColRef);
  const allDeps = depSnap.docs.map((d) => dependencyConverter.fromFirestore(d));

  return computeReadyIssues(allIssues, allDeps);
}
