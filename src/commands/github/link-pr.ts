import { Command } from 'commander';
import { getGithubConfig } from '../../utils/config.js';
import { getGithubPr } from '../../services/github-service.js';
import { updateIssueGithubPrUrl } from '../../services/issue-service.js';
import { getIssue } from '../../services/issue-service.js';
import { outputResult } from '../../utils/formatter.js';

export const linkPrCommand = new Command('link-pr')
  .description('Link a GitHub PR to an rt issue')
  .argument('<issueId>', 'rt issue ID')
  .argument('<prNumber>', 'GitHub PR number')
  .option('--json', 'Output as JSON', false)
  .action(async (issueId: string, prNumber: string, opts) => {
    try {
      const config = getGithubConfig();

      // Validate the issue exists
      const issue = await getIssue(issueId);

      // Validate the PR exists and get its URL
      const prNum = parseInt(prNumber, 10);
      if (isNaN(prNum)) {
        throw new Error(`Invalid PR number: ${prNumber}`);
      }
      const pr = await getGithubPr(prNum, config);

      // Store the PR URL on the rt issue
      await updateIssueGithubPrUrl(issueId, pr.html_url);

      if (opts.json) {
        outputResult({
          issueId: issue.id,
          prNumber: pr.number,
          prUrl: pr.html_url,
          prTitle: pr.title,
          linked: true,
        }, true);
      } else {
        console.log(`Linked PR #${pr.number} (${pr.title}) to issue ${issue.id}`);
        console.log(`  PR URL: ${pr.html_url}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
