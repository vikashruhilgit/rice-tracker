import { Command } from 'commander';
import { getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { Issue, Dependency, Label } from '../types/index.js';
import {
  issuesCollection,
  dependenciesCollection,
  labelsCollection,
} from '../firebase/collections.js';
import { getCurrentProjectId } from '../utils/config.js';
import { issueConverter } from '../models/issue.js';
import { dependencyConverter } from '../models/dependency.js';

export interface HealthIssue {
  type: 'orphaned_dependency' | 'orphaned_label_ref' | 'orphaned_parent' | 'cycle';
  id: string;
  description: string;
  fixable: boolean;
}

export async function runDoctor(fix: boolean): Promise<{ issues: HealthIssue[]; fixed: number }> {
  const projectId = getCurrentProjectId();

  // Fetch all data
  const issueSnap = await getDocs(issuesCollection(projectId));
  const allIssues: Issue[] = issueSnap.docs.map((d) => issueConverter.fromFirestore(d));
  const issueIds = new Set(allIssues.map((i) => i.id));

  const depSnap = await getDocs(dependenciesCollection(projectId));
  const allDeps: Dependency[] = depSnap.docs.map((d) => dependencyConverter.fromFirestore(d));

  const labelSnap = await getDocs(labelsCollection(projectId));
  const knownLabels = new Set<string>(labelSnap.docs.map((d) => (d.data() as Label).name));

  const healthIssues: HealthIssue[] = [];
  let fixed = 0;

  // 1. Orphaned dependencies
  for (const dep of allDeps) {
    const fromMissing = !issueIds.has(dep.fromId);
    const toMissing = !issueIds.has(dep.toId);

    if (fromMissing || toMissing) {
      const missing = [fromMissing ? dep.fromId : null, toMissing ? dep.toId : null]
        .filter(Boolean)
        .join(', ');
      healthIssues.push({
        type: 'orphaned_dependency',
        id: dep.id,
        description: `Dependency ${dep.id} (${dep.fromId} -> ${dep.toId}) references missing issue(s): ${missing}`,
        fixable: true,
      });

      if (fix) {
        await deleteDoc(doc(dependenciesCollection(projectId), dep.id));
        fixed++;
      }
    }
  }

  // 2. Orphaned label references
  for (const issue of allIssues) {
    const orphanedLabels = issue.labels.filter((l) => !knownLabels.has(l));
    if (orphanedLabels.length > 0) {
      healthIssues.push({
        type: 'orphaned_label_ref',
        id: issue.id,
        description: `Issue ${issue.id} references unknown labels: ${orphanedLabels.join(', ')}`,
        fixable: true,
      });

      if (fix) {
        const cleanLabels = issue.labels.filter((l) => knownLabels.has(l));
        const colRef = issuesCollection(projectId);
        await updateDoc(doc(colRef, issue.id), { labels: cleanLabels });
        fixed++;
      }
    }
  }

  // 3. Orphaned parentId references
  for (const issue of allIssues) {
    if (issue.parentId !== null && !issueIds.has(issue.parentId)) {
      healthIssues.push({
        type: 'orphaned_parent',
        id: issue.id,
        description: `Issue ${issue.id} has parentId "${issue.parentId}" which does not exist`,
        fixable: false,
      });
    }
  }

  // 4. Dependency cycles (report existing cycles in current graph)
  // Build adjacency map once — O(n)
  const adjMap = new Map<string, Set<string>>();
  for (const dep of allDeps) {
    if (!adjMap.has(dep.fromId)) adjMap.set(dep.fromId, new Set());
    adjMap.get(dep.fromId)!.add(dep.toId);
  }

  const canReach = (from: string, to: string): boolean => {
    const seen = new Set<string>();
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === to) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      adjMap.get(cur)?.forEach((n) => queue.push(n));
    }
    return false;
  };

  for (const dep of allDeps) {
    adjMap.get(dep.fromId)?.delete(dep.toId);       // temporarily remove edge
    const inCycle = canReach(dep.toId, dep.fromId);  // check remaining graph
    adjMap.get(dep.fromId)?.add(dep.toId);           // restore edge
    if (inCycle) {
      healthIssues.push({
        type: 'cycle',
        id: dep.id,
        description: `Cycle detected involving dependency ${dep.fromId} -> ${dep.toId}`,
        fixable: false,
      });
    }
  }

  return { issues: healthIssues, fixed };
}

export const doctorCommand = new Command('doctor')
  .description('Check Firestore data integrity and report health issues')
  .option('--fix', 'Auto-repair fixable issues (orphaned deps, orphaned label refs)', false)
  .option('--json', 'Output structured JSON report', false)
  .action(async (opts) => {
    try {
      const result = await runDoctor(opts.fix as boolean);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.issues.length === 0) {
        console.log('✓ No health issues found.');
      } else {
        console.log(`Found ${result.issues.length} health issue(s):\n`);
        for (const healthIssue of result.issues) {
          const fixTag = healthIssue.fixable ? '[fixable]' : '[manual]';
          console.log(`  ${healthIssue.type} ${fixTag}`);
          console.log(`    ${healthIssue.description}`);
        }
      }

      if (opts.fix && result.fixed > 0) {
        console.log(`\nFixed ${result.fixed} issue(s).`);
      } else if (opts.fix && result.fixed === 0) {
        console.log('\nNothing to fix.');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
