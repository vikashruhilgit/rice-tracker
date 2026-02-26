import chalk from 'chalk';
import Table from 'cli-table3';
import type { Issue } from '../types/index.js';
import { toDisplayTime } from '../services/time-service.js';

export function formatTimestamp(date: Date, timezone: string): string {
  return toDisplayTime(date, timezone);
}

export function priorityLabel(p: number): string {
  const labels: Record<number, string> = {
    0: chalk.red('P0-crit'),
    1: chalk.yellow('P1-high'),
    2: chalk.blue('P2-med'),
    3: chalk.gray('P3-low'),
  };
  return labels[p] ?? `P${p}`;
}

export function statusLabel(s: string): string {
  const colors: Record<string, (text: string) => string> = {
    open: chalk.green,
    in_progress: chalk.yellow,
    closed: chalk.gray,
  };
  return (colors[s] ?? chalk.white)(s);
}

export function formatIssueTable(issues: Issue[], timezone: string): string {
  const table = new Table({
    head: ['ID', 'Title', 'Status', 'Priority', 'Assignee', 'Created'],
  });
  for (const issue of issues) {
    table.push([
      issue.id,
      issue.title.substring(0, 50),
      statusLabel(issue.status),
      priorityLabel(issue.priority),
      issue.assignee ?? '-',
      formatTimestamp(issue.createdAt, timezone),
    ]);
  }
  return table.toString();
}

export function formatIssueDetail(issue: Issue, timezone: string): string {
  return [
    `${chalk.bold(issue.id)} ${chalk.bold(issue.title)}`,
    `Type: ${issue.type}  Status: ${statusLabel(issue.status)}  Priority: ${priorityLabel(issue.priority)}`,
    `Assignee: ${issue.assignee ?? 'none'}`,
    `Labels: ${issue.labels.length > 0 ? issue.labels.join(', ') : 'none'}`,
    issue.parentId ? `Parent: ${issue.parentId}` : null,
    issue.jiraKey ? `Jira: ${issue.jiraKey}` : null,
    issue.githubNumber ? `GitHub: #${issue.githubNumber}` : null,
    issue.githubPrUrl ? `GitHub PR: ${issue.githubPrUrl}` : null,
    issue.dueAt ? `Due: ${formatTimestamp(issue.dueAt, timezone)}` : null,
    issue.deferUntil ? `Defer until: ${formatTimestamp(issue.deferUntil, timezone)}` : null,
    `Created: ${formatTimestamp(issue.createdAt, timezone)} by ${issue.createdBy}`,
    `Updated: ${formatTimestamp(issue.updatedAt, timezone)}`,
    issue.closedAt ? `Closed: ${formatTimestamp(issue.closedAt, timezone)}` : null,
    issue.description ? `\n${issue.description}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function outputResult(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  }
}
