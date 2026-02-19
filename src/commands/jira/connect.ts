import { Command } from 'commander';
import { setJiraConfig } from '../../utils/config.js';
import { validateJiraConnection, resetJiraClient } from '../../services/jira-service.js';
import { outputResult } from '../../utils/formatter.js';
import type { JiraConfig } from '../../types/jira.js';

export const connectCommand = new Command('connect')
  .description('Connect to a Jira instance')
  .requiredOption('--host <host>', 'Jira host (e.g., your-org.atlassian.net)')
  .requiredOption('--email <email>', 'Jira account email')
  .requiredOption('--token <token>', 'Jira API token')
  .requiredOption('--project-key <key>', 'Jira project key (e.g., PROJ)')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const config: JiraConfig = {
        host: opts.host,
        email: opts.email,
        apiToken: opts.token,
        projectKey: opts.projectKey,
      };

      // Reset cached client so new config takes effect
      resetJiraClient();

      // Validate by fetching project info
      const project = await validateJiraConnection(config);

      // Store config
      setJiraConfig(config);

      if (opts.json) {
        outputResult({
          connected: true,
          host: config.host,
          projectKey: project.key,
          projectName: project.name,
        }, true);
      } else {
        console.log(`Connected to Jira project: ${project.name} (${project.key}) at ${config.host}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
