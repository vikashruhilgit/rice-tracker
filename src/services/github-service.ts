import { Octokit } from '@octokit/rest';
import type { Endpoints } from '@octokit/types';
import type { GithubConfig } from '../types/github.js';
import type { Issue } from '../types/index.js';

export type GithubIssueData = Endpoints['GET /repos/{owner}/{repo}/issues/{issue_number}']['response']['data'];
export type GithubSearchItem = Endpoints['GET /search/issues-and-pull-requests']['response']['data']['items'][number];

let client: Octokit | null = null;
let clientToken: string | null = null;

export function getGithubClient(config: GithubConfig): Octokit {
  if (!client || clientToken !== config.token) {
    client = new Octokit({ auth: config.token });
    clientToken = config.token;
  }
  return client;
}

export function resetGithubClient(): void {
  client = null;
  clientToken = null;
}

export async function validateGithubConnection(
  config: GithubConfig,
): Promise<{ owner: string; repo: string; fullName: string }> {
  const octokit = getGithubClient(config);
  const { data: repo } = await octokit.repos.get({
    owner: config.owner,
    repo: config.repo,
  });
  return { owner: repo.owner.login, repo: repo.name, fullName: repo.full_name };
}

export async function createGithubIssue(
  issue: Issue,
  config: GithubConfig,
  labels: string[],
): Promise<number> {
  const octokit = getGithubClient(config);
  const body = issue.description || 'No description';
  const { data } = await octokit.issues.create({
    owner: config.owner,
    repo: config.repo,
    title: issue.title,
    body: `${body}\n\n---\n_Synced from rice-tracker issue \`${issue.id}\`_`,
    labels,
  });
  return data.number;
}

export async function updateGithubIssue(
  githubNumber: number,
  issue: Issue,
  config: GithubConfig,
  labels: string[],
): Promise<void> {
  const octokit = getGithubClient(config);
  const body = issue.description || 'No description';
  await octokit.issues.update({
    owner: config.owner,
    repo: config.repo,
    issue_number: githubNumber,
    title: issue.title,
    body: `${body}\n\n---\n_Synced from rice-tracker issue \`${issue.id}\`_`,
    labels,
    state: issue.status === 'closed' ? 'closed' : 'open',
  });
}

export async function getGithubIssue(
  githubNumber: number,
  config: GithubConfig,
): Promise<GithubIssueData> {
  const octokit = getGithubClient(config);
  const { data } = await octokit.issues.get({
    owner: config.owner,
    repo: config.repo,
    issue_number: githubNumber,
  });
  return data;
}

export async function searchGithubIssues(
  filter: string | undefined,
  config: GithubConfig,
): Promise<GithubSearchItem[]> {
  const octokit = getGithubClient(config);

  // Use the search API with repo qualifier
  const q = filter
    ? `repo:${config.owner}/${config.repo} is:issue ${filter}`
    : `repo:${config.owner}/${config.repo} is:issue is:open`;

  const { data } = await octokit.search.issuesAndPullRequests({
    q,
    per_page: 100,
  });

  // Filter out pull requests (GitHub search includes them)
  return data.items.filter((item) => !item.pull_request);
}

export async function getGithubPr(
  prNumber: number,
  config: GithubConfig,
): Promise<{ number: number; html_url: string; title: string }> {
  const octokit = getGithubClient(config);
  const { data } = await octokit.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber,
  });
  return { number: data.number, html_url: data.html_url, title: data.title };
}
