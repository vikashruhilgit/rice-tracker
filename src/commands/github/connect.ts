import { Command } from 'commander';
import { setGithubConfig } from '../../utils/config.js';
import { validateGithubConnection, resetGithubClient } from '../../services/github-service.js';
import { outputResult } from '../../utils/formatter.js';
import type { GithubConfig } from '../../types/github.js';

export const connectCommand = new Command('connect')
  .description('Connect to a GitHub repository')
  .requiredOption('--owner <owner>', 'GitHub repository owner (user or organization)')
  .requiredOption('--repo <repo>', 'GitHub repository name')
  .option('--token <token>', 'GitHub personal access token (or set GITHUB_TOKEN env var)')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const token = opts.token ?? process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error(
          'GitHub token is required. Use --token <token> or set GITHUB_TOKEN environment variable.',
        );
      }

      if (opts.token) {
        console.error('Warning: Token will be stored in plaintext config. Consider using GITHUB_TOKEN env var instead.');
      }

      const config: GithubConfig = {
        owner: opts.owner,
        repo: opts.repo,
        token,
      };

      // Reset cached client so new config takes effect
      resetGithubClient();

      // Validate by fetching repo info
      const repoInfo = await validateGithubConnection(config);

      // Store config
      setGithubConfig(config);

      if (opts.json) {
        outputResult({
          connected: true,
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          fullName: repoInfo.fullName,
        }, true);
      } else {
        console.log(`Connected to GitHub repository: ${repoInfo.fullName}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
