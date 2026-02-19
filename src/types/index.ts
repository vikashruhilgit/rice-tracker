export type IssueType = 'task' | 'bug' | 'epic' | 'message';
export type IssueStatus = 'open' | 'in_progress' | 'closed';
export type Priority = 0 | 1 | 2 | 3; // P0=critical -> P3=low
export type DependencyType = 'blocks' | 'related' | 'parent_child' | 'discovered_from';

export interface Issue {
  id: string;              // Hash-based (e.g., "rt-a1b2")
  title: string;
  description: string;
  type: IssueType;
  status: IssueStatus;
  priority: Priority;
  assignee: string | null;
  labels: string[];
  parentId: string | null;     // Epic hierarchy
  childIndex: number | null;   // .1, .2 numbering
  jiraKey: string | null;      // Linked Jira ticket
  jiraSyncedAt: Date | null;
  createdAt: Date;             // UTC always
  updatedAt: Date;             // UTC always
  closedAt: Date | null;       // UTC always
  createdBy: string;
  contentHash: string;         // For change detection
}

export interface Dependency {
  id: string;
  fromId: string;              // Source issue
  toId: string;                // Target issue
  type: DependencyType;
  createdAt: Date;
  createdBy: string;
}

export interface Comment {
  id: string;
  issueId: string;
  body: string;
  createdAt: Date;
  createdBy: string;
  thread: string | null;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  description: string;
}

export interface AuditEvent {
  id: string;
  issueId: string;
  action: string;              // "created", "updated", "closed", etc.
  changes: Record<string, { from: unknown; to: unknown }>;
  createdAt: Date;
  createdBy: string;
}

export interface ProjectConfig {
  projectId: string;
  timezone: string;            // IANA timezone (default: local)
  defaultPriority: Priority;
  defaultType: IssueType;
}
