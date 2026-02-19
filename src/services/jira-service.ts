import { Version3Client } from 'jira.js';
import type { JiraConfig, JiraFieldMapping } from '../types/jira.js';
import type { Issue } from '../types/index.js';

let client: Version3Client | null = null;
let clientHost: string | null = null;

export function getJiraClient(config: JiraConfig): Version3Client {
  if (!client || clientHost !== config.host) {
    client = new Version3Client({
      host: `https://${config.host}`,
      authentication: {
        basic: {
          email: config.email,
          apiToken: config.apiToken,
        },
      },
    });
    clientHost = config.host;
  }
  return client;
}

export function resetJiraClient(): void {
  client = null;
  clientHost = null;
}

export async function validateJiraConnection(config: JiraConfig): Promise<{ key: string; name: string }> {
  const jira = getJiraClient(config);
  const project = await jira.projects.getProject({ projectIdOrKey: config.projectKey });
  return { key: project.key, name: project.name };
}

export async function createJiraIssue(
  issue: Issue,
  config: JiraConfig,
  mapping: JiraFieldMapping,
): Promise<string> {
  const jira = getJiraClient(config);
  const result = await jira.issues.createIssue({
    fields: {
      project: { key: config.projectKey },
      summary: issue.title,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: issue.description || 'No description' }],
          },
        ],
      },
      issuetype: { name: mapping.type[issue.type] || 'Task' },
      priority: { name: mapping.priority[String(issue.priority)] || 'Medium' },
    },
  });
  return result.key!;
}

export async function updateJiraIssue(
  jiraKey: string,
  issue: Issue,
  config: JiraConfig,
  mapping: JiraFieldMapping,
): Promise<void> {
  const jira = getJiraClient(config);
  await jira.issues.editIssue({
    issueIdOrKey: jiraKey,
    fields: {
      summary: issue.title,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: issue.description || 'No description' }],
          },
        ],
      },
      priority: { name: mapping.priority[String(issue.priority)] || 'Medium' },
    },
  });
}

export async function getJiraIssue(
  jiraKey: string,
  config: JiraConfig,
): Promise<any> {
  const jira = getJiraClient(config);
  return jira.issues.getIssue({ issueIdOrKey: jiraKey });
}

export async function searchJiraIssues(
  jql: string,
  config: JiraConfig,
): Promise<any[]> {
  const jira = getJiraClient(config);
  const result = await jira.issueSearch.searchForIssuesUsingJql({ jql });
  return result.issues ?? [];
}
