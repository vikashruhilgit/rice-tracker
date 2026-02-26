import {
  doc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import type { Issue, Dependency, CompactStub } from '../types/index.js';
import { issuesCollection, archivedCollection, dependenciesCollection } from '../firebase/collections.js';
import { getCurrentProjectId } from '../utils/config.js';
import { issueConverter } from '../models/issue.js';
import { getDb } from '../firebase/client.js';

export interface CompactCandidate {
  issue: Issue;
  skip: boolean;
  skipReason?: 'has-open-dependents' | 'not-closed' | 'too-recent';
}

export interface CompactReport {
  dryRun: boolean;
  matched: number;
  compacted: number;
  skipped: number;
  issues: {
    id: string;
    title: string;
    closedAt: string | null;
    reason: 'compacted' | 'skipped';
    skipReason?: string;
  }[];
}

export function parseOlderThan(str: string): number {
  const match = str.match(/^(\d+)d$/);
  if (!match) {
    throw new Error(`Invalid --older-than format: "${str}". Expected format: <number>d (e.g., 7d, 30d, 90d)`);
  }
  return parseInt(match[1], 10) * 24 * 60 * 60 * 1000;
}

export function generateSummary(issue: Issue, deps: Dependency[]): string {
  const parts: string[] = [];

  const closedAtStr = issue.closedAt ? issue.closedAt.toISOString().split('T')[0] : 'unknown date';
  parts.push(`[${issue.type}] '${issue.title}' was ${issue.status} on ${closedAtStr}.`);

  if (issue.description) {
    const firstSentence = issue.description.split(/[.!?\n]/)[0].trim();
    if (firstSentence) {
      parts.push(firstSentence + (firstSentence.endsWith('.') ? '' : '.'));
    }
  }

  const relatedIds = deps.map((d) => {
    const otherId = d.fromId === issue.id ? d.toId : d.fromId;
    return `${otherId} (${d.type})`;
  });
  if (relatedIds.length > 0) {
    parts.push(`Dependencies: ${relatedIds.join(', ')}.`);
  }

  return parts.join(' ');
}

export async function getCompactCandidates(olderThanMs: number): Promise<CompactCandidate[]> {
  const projectId = getCurrentProjectId();
  const issueCol = issuesCollection(projectId);
  const depCol = dependenciesCollection(projectId);

  // Fetch all closed issues
  const closedQuery = query(issueCol, where('status', '==', 'closed'));
  const closedSnap = await getDocs(closedQuery);
  const closedIssues = closedSnap.docs.map((d) => issueConverter.fromFirestore(d));

  // Fetch all dependencies
  const depSnap = await getDocs(depCol);
  const allDeps = depSnap.docs.map((d) => d.data() as Dependency);

  // Fetch all open/in_progress issue IDs to check dependents
  const allIssueSnap = await getDocs(issueCol);
  const openIssueIds = new Set(
    allIssueSnap.docs
      .map((d) => d.data())
      .filter((d) => d.status === 'open' || d.status === 'in_progress')
      .map((d) => d.id as string),
  );

  const cutoff = new Date(Date.now() - olderThanMs);
  const candidates: CompactCandidate[] = [];

  for (const issue of closedIssues) {
    // Skip if closed too recently
    if (!issue.closedAt || issue.closedAt > cutoff) {
      candidates.push({ issue, skip: true, skipReason: 'too-recent' });
      continue;
    }

    // Skip if an open issue depends on this one (this issue is a toId in a "blocks" dep where fromId is this issue and toId is open,
    // OR this issue appears as toId in any dep where fromId is open)
    // Actually: skip if this issue is depended on by an open issue.
    // "depended on" means: there's a dependency where this issue is the toId (target) and the fromId (source) is open
    // Wait — re-read the spec: "issues that are depended on by open issues (i.e., they appear as toId in a dependency where the fromId issue is still open)"
    // This means: if dep.toId === issue.id AND dep.fromId is an open issue, skip.
    const hasOpenDependents = allDeps.some(
      (dep) => dep.toId === issue.id && openIssueIds.has(dep.fromId),
    );

    if (hasOpenDependents) {
      candidates.push({ issue, skip: true, skipReason: 'has-open-dependents' });
      continue;
    }

    candidates.push({ issue, skip: false });
  }

  return candidates;
}

export async function compactIssues(
  candidates: CompactCandidate[],
  apply: boolean,
): Promise<CompactReport> {
  const projectId = getCurrentProjectId();
  const issueCol = issuesCollection(projectId);
  const archiveCol = archivedCollection(projectId);
  const depCol = dependenciesCollection(projectId);

  const toCompact = candidates.filter((c) => !c.skip);
  const skipped = candidates.filter((c) => c.skip);

  const report: CompactReport = {
    dryRun: !apply,
    matched: candidates.length,
    compacted: 0,
    skipped: skipped.length,
    issues: [],
  };

  // Add skipped issues to report
  for (const c of skipped) {
    report.issues.push({
      id: c.issue.id,
      title: c.issue.title,
      closedAt: c.issue.closedAt?.toISOString() ?? null,
      reason: 'skipped',
      skipReason: c.skipReason,
    });
  }

  if (!apply) {
    // Dry run — just report what would be compacted
    for (const c of toCompact) {
      report.issues.push({
        id: c.issue.id,
        title: c.issue.title,
        closedAt: c.issue.closedAt?.toISOString() ?? null,
        reason: 'compacted',
      });
    }
    report.compacted = toCompact.length;
    return report;
  }

  // Apply compaction
  for (const c of toCompact) {
    const issue = c.issue;

    // Get dependencies for summary
    const fromQuery = query(depCol, where('fromId', '==', issue.id));
    const toQuery = query(depCol, where('toId', '==', issue.id));
    const [fromSnap, toSnap] = await Promise.all([getDocs(fromQuery), getDocs(toQuery)]);
    const deps = [
      ...fromSnap.docs.map((d) => d.data() as Dependency),
      ...toSnap.docs.map((d) => d.data() as Dependency),
    ];

    const summary = generateSummary(issue, deps);
    const now = new Date();

    // Use WriteBatch for atomic operation: archive + replace with stub
    const db = getDb();
    const batch = writeBatch(db);

    // 1. Write full issue to archived collection
    const archiveDocRef = doc(archiveCol, issue.id);
    batch.set(archiveDocRef, issueConverter.toFirestore(issue));

    // 2. Replace issue in main collection with compact stub
    const stub: CompactStub = {
      id: issue.id,
      title: `${issue.title} (compacted)`,
      status: 'archived',
      type: issue.type,
      compactedAt: now,
      summary,
      archiveRef: `archived/${issue.id}`,
    };

    const issueDocRef = doc(issueCol, issue.id);
    batch.set(issueDocRef, {
      ...stub,
      compactedAt: Timestamp.fromDate(now),
    });

    await batch.commit();

    report.compacted++;
    report.issues.push({
      id: issue.id,
      title: issue.title,
      closedAt: issue.closedAt?.toISOString() ?? null,
      reason: 'compacted',
    });
  }

  return report;
}

export async function getArchivedIssue(id: string): Promise<Issue> {
  const projectId = getCurrentProjectId();
  const archiveCol = archivedCollection(projectId);
  const docRef = doc(archiveCol, id);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    throw new Error(`Archived issue ${id} not found`);
  }

  return issueConverter.fromFirestore(snapshot);
}
