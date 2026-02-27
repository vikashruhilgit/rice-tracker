export type IssueType = 'task' | 'bug' | 'epic' | 'message' | 'decision';
export type IssueStatus = 'open' | 'in_progress' | 'closed' | 'archived';
export type Priority = 0 | 1 | 2 | 3; // P0=critical -> P3=low
export type DependencyType = 'blocks' | 'related' | 'parent_child' | 'discovered_from' | 'duplicates' | 'supersedes' | 'replies_to';

export interface Issue {
  id: string;              // Hash-based (e.g., "rt-a1b2")
  title: string;
  description: string;
  type: IssueType;
  status: IssueStatus;
  priority: Priority;
  assignee: string | null;
  labels: string[];         // Legacy: label names (kept for backwards compat)
  labelIds: string[];       // Preferred: label IDs (rt-xxxx format)
  parentId: string | null;     // Epic hierarchy
  childIndex: number | null;   // .1, .2 numbering
  jiraKey: string | null;      // Linked Jira ticket
  jiraSyncedAt: Date | null;
  jiraContentHash: string | null; // contentHash snapshot at last Jira sync
  githubNumber: number | null;   // Linked GitHub issue number
  githubSyncedAt: Date | null;   // Last sync timestamp with GitHub
  githubPrUrl: string | null;    // Linked GitHub PR URL
  deferUntil: Date | null;     // Scheduling: defer until date
  dueAt: Date | null;          // Scheduling: due date
  createdAt: Date;             // UTC always
  updatedAt: Date;             // UTC always
  closedAt: Date | null;       // UTC always
  createdBy: string;
  contentHash: string;         // For change detection
  githubContentHashAtSync: string | null; // contentHash snapshot at last GitHub sync
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
  labelId: string;         // Stable nanoid (same format as issue IDs: rt-xxxx)
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

export interface CompactStub {
  id: string;
  title: string;
  status: 'archived';
  type: IssueType;
  compactedAt: Date;
  summary: string;
  archiveRef: string;
}

export interface ProjectConfig {
  projectId: string;
  timezone: string;            // IANA timezone (default: local)
  defaultPriority: Priority;
  defaultType: IssueType;
}
