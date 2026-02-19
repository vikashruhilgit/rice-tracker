import { Command } from 'commander';
import type { ProjectConfig } from '../types/index.js';
import { setCurrentProject } from '../utils/config.js';
import { outputResult } from '../utils/formatter.js';

export const initCommand = new Command('init')
  .description('Initialize Firebase project configuration')
  .option('--project-id <id>', 'Firebase project ID')
  .option('--timezone <tz>', 'IANA timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const projectId = opts.projectId;
      if (!projectId) {
        console.error('Error: --project-id is required');
        process.exit(1);
      }

      const config: ProjectConfig = {
        projectId,
        timezone: opts.timezone,
        defaultPriority: 2,
        defaultType: 'task',
      };

      setCurrentProject(projectId, config);

      if (opts.json) {
        outputResult(config, true);
      } else {
        console.log(`Project "${projectId}" initialized with timezone ${config.timezone}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
