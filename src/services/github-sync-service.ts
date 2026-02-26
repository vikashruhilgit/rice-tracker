import type { GithubLabelMapping } from '../types/github.js';
import { DEFAULT_GITHUB_LABEL_MAPPING } from '../types/github.js';
import type { Issue, IssueType, Priority } from '../types/index.js';
import { getGithubConfig } from '../utils/config.js';
import {
  createIssue,
  getIssue,
  updateIssue,
  updateIssueGithubFields,
  listIssues,
} from './issue-service.js';
import {
  createGithubIssue,
  updateGithubIssue,
  searchGithubIssues,
} from './github-service.js';

export interface GithubSyncResult {
  action: 'created' | 'updated' | 'skipped';
  issueId: string;
  githubNumber: number;
  direction: 'push' | 'pull';
}

export interface GithubPullSummary {
  created: number;
  updated: number;
  skipped: number;
  conflicts: Array<{ rtId: string; githubNumber: number; reason: string }>;
  results: GithubSyncResult[];
}

/**
 * Build GitHub labels from an rt issue using the label mapping.
 */
function buildLabels(issue: Issue, mapping: GithubLabelMapping): string[] {
  const labels: string[] = [];

  const priorityLabel = mapping.priority[String(issue.priority)];
  if (priorityLabel) labels.push(priorityLabel);

  const typeLabel = mapping.type[issue.type];
  if (typeLabel) labels.push(typeLabel);

  const statusLabel = mapping.status[issue.status];
  if (statusLabel) labels.push(statusLabel);

  // Include rt labels directly
  for (const label of issue.labels) {
    labels.push(label);
  }

  return labels.filter(Boolean);
}

/**
 * Push a single rt issue to GitHub.
 * Creates a new GitHub issue if no githubNumber exists; updates if it does.
 */
export async function pushToGithub(issueId: string): Promise<GithubSyncResult> {
  const config = getGithubConfig();
  const mapping = DEFAULT_GITHUB_LABEL_MAPPING;
  const issue = await getIssue(issueId);
  const labels = buildLabels(issue, mapping);

  if (issue.githubNumber) {
    await updateGithubIssue(issue.githubNumber, issue, config, labels);
    const now = new Date();
    await updateIssueGithubFields(issueId, issue.githubNumber, now, issue.contentHash);
    return { action: 'updated', issueId, githubNumber: issue.githubNumber, direction: 'push' };
  }

  const githubNumber = await createGithubIssue(issue, config, labels);
  const now = new Date();
  await updateIssueGithubFields(issueId, githubNumber, now, issue.contentHash);
  return { action: 'created', issueId, githubNumber, direction: 'push' };
}

/**
 * Push all rt issues that don't have a githubNumber yet.
 */
export async function pushAllToGithub(): Promise<GithubSyncResult[]> {
  const allIssues = await listIssues();
  const results: GithubSyncResult[] = [];

  for (const issue of allIssues) {
    if (!issue.githubNumber) {
      const result = await pushToGithub(issue.id);
      results.push(result);
    }
  }

  return results;
}

/**
 * Parse GitHub issue labels to extract rt priority.
 */
function parsePriorityFromLabels(labels: string[]): Priority {
  for (const label of labels) {
    const match = label.match(/^rt:priority:P(\d)$/);
    if (match) {
      const num = Number(match[1]);
      if (num >= 0 && num <= 3) return num as Priority;
    }
  }
  return 2; // default medium
}

/**
 * Parse GitHub issue labels to extract rt type.
 */
function parseTypeFromLabels(labels: string[]): IssueType {
  const reverseType: Record<string, IssueType> = {};
  for (const [rtType, ghLabel] of Object.entries(DEFAULT_GITHUB_LABEL_MAPPING.type)) {
    reverseType[ghLabel] = rtType as IssueType;
  }

  for (const label of labels) {
    if (reverseType[label]) return reverseType[label];
  }
  return 'task'; // default
}

/**
 * Pull GitHub Issues into rt.
 * Supports conflict detection via contentHash comparison and --force override.
 */
export async function pullFromGithub(
  filter?: string,
  force = false,
): Promise<GithubPullSummary> {
  const config = getGithubConfig();
  const ghIssues = await searchGithubIssues(filter, config);

  const summary: GithubPullSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: [],
    results: [],
  };

  // Build lookup: githubNumber -> rt issue
  const allIssues = await listIssues();
  const ghNumberToIssue = new Map<number, Issue>();
  for (const issue of allIssues) {
    if (issue.githubNumber) {
      ghNumberToIssue.set(issue.githubNumber, issue);
    }
  }

  for (const ghIssue of ghIssues) {
    const ghNumber = ghIssue.number;
    const ghLabels = ghIssue.labels.map((l) =>
      typeof l === 'string' ? l : l.name ?? '',
    );

    const title = ghIssue.title ?? 'Untitled';
    // Extract body without the rt sync footer
    let description = ghIssue.body ?? '';
    const footerIdx = description.lastIndexOf('\n\n---\n_Synced from rice-tracker');
    if (footerIdx !== -1) {
      description = description.slice(0, footerIdx);
    }

    const existingIssue = ghNumberToIssue.get(ghNumber);

    if (existingIssue) {
      // Check for local modifications since last sync (conflict detection)
      if (!force && existingIssue.githubContentHashAtSync !== null) {
        if (existingIssue.contentHash !== existingIssue.githubContentHashAtSync) {
          // Local changes exist since last sync — conflict
          summary.skipped++;
          summary.conflicts.push({
            rtId: existingIssue.id,
            githubNumber: ghNumber,
            reason: 'Local rt issue has been modified since last sync',
          });
          summary.results.push({
            action: 'skipped',
            issueId: existingIssue.id,
            githubNumber: ghNumber,
            direction: 'pull',
          });
          continue;
        }
      }

      // Update existing rt issue from GitHub
      await updateIssue(existingIssue.id, {
        title,
        description,
        type: parseTypeFromLabels(ghLabels),
        priority: parsePriorityFromLabels(ghLabels),
        status: ghIssue.state === 'closed' ? 'closed' : 'open',
      });
      const now = new Date();
      await updateIssueGithubFields(existingIssue.id, ghNumber, now, existingIssue.contentHash);
      summary.updated++;
      summary.results.push({
        action: 'updated',
        issueId: existingIssue.id,
        githubNumber: ghNumber,
        direction: 'pull',
      });
    } else {
      // Create new rt issue from GitHub
      const newIssue = await createIssue({
        title,
        description,
        type: parseTypeFromLabels(ghLabels),
        priority: parsePriorityFromLabels(ghLabels),
      });
      await updateIssueGithubFields(newIssue.id, ghNumber, new Date(), newIssue.contentHash);
      summary.created++;
      summary.results.push({
        action: 'created',
        issueId: newIssue.id,
        githubNumber: ghNumber,
        direction: 'pull',
      });
    }
  }

  return summary;
}
