import type { JiraConfig, JiraFieldMapping } from '../types/jira.js';
import type { Issue, IssueType, Priority, IssueStatus } from '../types/index.js';
import {
  getJiraConfig,
  getJiraFieldMapping,
} from '../utils/config.js';
import {
  createIssue,
  getIssue,
  updateIssue,
  updateIssueJiraFields,
  listIssues,
} from './issue-service.js';
import {
  createJiraIssue,
  updateJiraIssue,
  searchJiraIssues,
} from './jira-service.js';

export interface SyncResult {
  action: 'created' | 'updated' | 'skipped';
  issueId: string;
  jiraKey: string;
  direction: 'push' | 'pull';
}

/**
 * Push a single rt issue to Jira.
 * Creates a new Jira issue if no jiraKey exists; updates if it does.
 */
export async function pushToJira(issueId: string): Promise<SyncResult> {
  const config = getJiraConfig();
  const mapping = getJiraFieldMapping();
  const issue = await getIssue(issueId);

  if (issue.jiraKey) {
    await updateJiraIssue(issue.jiraKey, issue, config, mapping);
    const now = new Date();
    await updateIssueJiraFields(issueId, issue.jiraKey, now);
    return { action: 'updated', issueId, jiraKey: issue.jiraKey, direction: 'push' };
  }

  const jiraKey = await createJiraIssue(issue, config, mapping);
  const now = new Date();
  await updateIssueJiraFields(issueId, jiraKey, now);
  return { action: 'created', issueId, jiraKey, direction: 'push' };
}

/**
 * Build a reverse mapping from Jira field values to rt field values.
 */
function reverseMapping(map: Record<string, string>): Record<string, string> {
  const reversed: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    reversed[value.toLowerCase()] = key;
  }
  return reversed;
}

/**
 * Map a Jira issue to rt issue fields.
 */
function mapJiraToRt(
  jiraIssue: any,
  mapping: JiraFieldMapping,
): {
  title: string;
  description: string;
  type: IssueType;
  priority: Priority;
  status: IssueStatus;
} {
  const reversePriority = reverseMapping(mapping.priority);
  const reverseType = reverseMapping(mapping.type);
  const reverseStatus = reverseMapping(mapping.status);

  const jiraPriority = jiraIssue.fields?.priority?.name?.toLowerCase() ?? 'medium';
  const jiraType = jiraIssue.fields?.issuetype?.name?.toLowerCase() ?? 'task';
  const jiraStatus = jiraIssue.fields?.status?.name?.toLowerCase() ?? 'to do';

  // Extract description text from ADF format
  let description = '';
  const descField = jiraIssue.fields?.description;
  if (typeof descField === 'string') {
    description = descField;
  } else if (descField?.content) {
    description = extractTextFromAdf(descField);
  }

  return {
    title: jiraIssue.fields?.summary ?? 'Untitled',
    description,
    type: (reverseType[jiraType] as IssueType) ?? 'task',
    priority: (Number(reversePriority[jiraPriority]) as Priority) ?? 2,
    status: (reverseStatus[jiraStatus] as IssueStatus) ?? 'open',
  };
}

/**
 * Extract plain text from Atlassian Document Format (ADF).
 */
function extractTextFromAdf(adf: any): string {
  if (!adf || !adf.content) return '';
  const parts: string[] = [];
  for (const node of adf.content) {
    if (node.content) {
      for (const inline of node.content) {
        if (inline.text) {
          parts.push(inline.text);
        }
      }
    }
  }
  return parts.join('\n');
}

/**
 * Pull issues from Jira into rt.
 * If a Jira issue is already linked, update the rt issue.
 * If not linked, create a new rt issue.
 */
export async function pullFromJira(jql?: string): Promise<SyncResult[]> {
  const config = getJiraConfig();
  const mapping = getJiraFieldMapping();
  const effectiveJql = jql ?? `project = ${config.projectKey}`;
  const jiraIssues = await searchJiraIssues(effectiveJql, config);
  const results: SyncResult[] = [];

  // Get all existing rt issues to check for links
  const allIssues = await listIssues();
  const jiraKeyToIssue = new Map<string, Issue>();
  for (const issue of allIssues) {
    if (issue.jiraKey) {
      jiraKeyToIssue.set(issue.jiraKey, issue);
    }
  }

  for (const jiraIssue of jiraIssues) {
    const jiraKey = jiraIssue.key!;
    const mapped = mapJiraToRt(jiraIssue, mapping);
    const existingIssue = jiraKeyToIssue.get(jiraKey);

    if (existingIssue) {
      await updateIssue(existingIssue.id, {
        title: mapped.title,
        description: mapped.description,
        type: mapped.type,
        priority: mapped.priority,
        status: mapped.status,
      });
      await updateIssueJiraFields(existingIssue.id, jiraKey, new Date());
      results.push({ action: 'updated', issueId: existingIssue.id, jiraKey, direction: 'pull' });
    } else {
      const newIssue = await createIssue({
        title: mapped.title,
        description: mapped.description,
        type: mapped.type,
        priority: mapped.priority,
      });
      await updateIssueJiraFields(newIssue.id, jiraKey, new Date());
      results.push({ action: 'created', issueId: newIssue.id, jiraKey, direction: 'pull' });
    }
  }

  return results;
}

/**
 * Bi-directional sync: pull from Jira first, then push unsynced rt issues.
 */
export async function syncAll(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Step 1: Pull from Jira
  const pullResults = await pullFromJira();
  results.push(...pullResults);

  // Step 2: Push unsynced rt issues to Jira
  const allIssues = await listIssues();
  for (const issue of allIssues) {
    if (!issue.jiraKey) {
      const pushResult = await pushToJira(issue.id);
      results.push(pushResult);
    }
  }

  return results;
}
