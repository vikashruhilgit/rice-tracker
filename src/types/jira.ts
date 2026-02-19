export interface JiraConfig {
  host: string;               // e.g., "your-org.atlassian.net"
  email: string;
  apiToken: string;
  projectKey: string;          // e.g., "PROJ"
}

export interface JiraFieldMapping {
  priority: Record<string, string>;    // rt priority -> Jira priority
  status: Record<string, string>;      // rt status -> Jira status
  type: Record<string, string>;        // rt type -> Jira issue type
}

export const DEFAULT_JIRA_FIELD_MAPPING: JiraFieldMapping = {
  priority: {
    '0': 'Highest',
    '1': 'High',
    '2': 'Medium',
    '3': 'Low',
  },
  status: {
    'open': 'To Do',
    'in_progress': 'In Progress',
    'closed': 'Done',
  },
  type: {
    'task': 'Task',
    'bug': 'Bug',
    'epic': 'Epic',
    'message': 'Story',
  },
};
