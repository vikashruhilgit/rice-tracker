import Conf from 'conf';
import type { ProjectConfig } from '../types/index.js';
import type { JiraConfig, JiraFieldMapping } from '../types/jira.js';
import { DEFAULT_JIRA_FIELD_MAPPING } from '../types/jira.js';
import type { GithubConfig } from '../types/github.js';

interface RtConfig {
  currentProject: string | null;
  projects: Record<string, ProjectConfig>;
  jira: JiraConfig | null;
  jiraFieldMapping: JiraFieldMapping;
  github: GithubConfig | null;
}

const config = new Conf<RtConfig>({
  projectName: 'rice-tracker',
  defaults: {
    currentProject: null,
    projects: {},
    jira: null,
    jiraFieldMapping: DEFAULT_JIRA_FIELD_MAPPING,
    github: null,
  },
});

export function getConfig(): Conf<RtConfig> {
  return config;
}

export function getCurrentProjectId(): string {
  const projectId = config.get('currentProject');
  if (!projectId) throw new Error('No project configured. Run `rt init` first.');
  return projectId;
}

export function setCurrentProject(projectId: string, projectConfig: ProjectConfig): void {
  config.set('currentProject', projectId);
  config.set(`projects.${projectId}`, projectConfig);
}

export function getProjectConfig(): ProjectConfig {
  const projectId = getCurrentProjectId();
  const projectConfig = config.get(`projects.${projectId}`) as ProjectConfig | undefined;
  if (!projectConfig) throw new Error('Project config not found. Run `rt init` first.');
  return projectConfig;
}

export function getTimezone(): string {
  try {
    return getProjectConfig().timezone;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

export function getJiraConfig(): JiraConfig {
  const jiraConfig = config.get('jira');
  if (!jiraConfig) throw new Error('Jira not configured. Run `rt jira connect` first.');
  return jiraConfig;
}

export function setJiraConfig(jiraConfig: JiraConfig): void {
  config.set('jira', jiraConfig);
}

export function getJiraFieldMapping(): JiraFieldMapping {
  return config.get('jiraFieldMapping');
}

export function setJiraFieldMapping(mapping: JiraFieldMapping): void {
  config.set('jiraFieldMapping', mapping);
}

export function resetJiraFieldMapping(): void {
  config.set('jiraFieldMapping', DEFAULT_JIRA_FIELD_MAPPING);
}

export function getGithubConfig(): GithubConfig {
  const githubConfig = config.get('github');
  if (!githubConfig) throw new Error('GitHub not configured. Run `rt github connect` first.');
  return githubConfig;
}

export function setGithubConfig(githubConfig: GithubConfig): void {
  config.set('github', githubConfig);
}
