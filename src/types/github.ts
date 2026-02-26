export interface GithubConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface GithubLabelMapping {
  priority: Record<string, string>;   // rt priority -> GitHub label
  type: Record<string, string>;       // rt type -> GitHub label
  status: Record<string, string>;     // rt status -> GitHub label
}

export const DEFAULT_GITHUB_LABEL_MAPPING: GithubLabelMapping = {
  priority: {
    '0': 'rt:priority:P0',
    '1': 'rt:priority:P1',
    '2': 'rt:priority:P2',
    '3': 'rt:priority:P3',
  },
  type: {
    'task': 'rt:type:task',
    'bug': 'bug',
    'epic': 'rt:type:epic',
    'message': 'rt:type:message',
    'decision': 'rt:type:decision',
  },
  status: {
    'open': '',
    'in_progress': 'rt:in-progress',
    'closed': '',
  },
};
