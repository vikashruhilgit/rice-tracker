import { Command } from 'commander';
import {
  getJiraFieldMapping,
  setJiraFieldMapping,
  resetJiraFieldMapping,
} from '../../utils/config.js';
import { outputResult } from '../../utils/formatter.js';
import type { JiraFieldMapping } from '../../types/jira.js';

export const mapCommand = new Command('map')
  .description('Manage Jira field mappings');

mapCommand
  .command('show')
  .description('Display current field mapping')
  .option('--json', 'Output as JSON', false)
  .action((opts) => {
    try {
      const mapping = getJiraFieldMapping();

      if (opts.json) {
        outputResult(mapping, true);
      } else {
        console.log('Priority mapping (rt -> Jira):');
        for (const [rt, jira] of Object.entries(mapping.priority)) {
          console.log(`  P${rt} -> ${jira}`);
        }

        console.log('\nStatus mapping (rt -> Jira):');
        for (const [rt, jira] of Object.entries(mapping.status)) {
          console.log(`  ${rt} -> ${jira}`);
        }

        console.log('\nType mapping (rt -> Jira):');
        for (const [rt, jira] of Object.entries(mapping.type)) {
          console.log(`  ${rt} -> ${jira}`);
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

mapCommand
  .command('set')
  .description('Set a custom field mapping')
  .argument('<field>', 'Field to map (priority|status|type)')
  .argument('<rtValue>', 'rt field value')
  .argument('<jiraValue>', 'Jira field value')
  .option('--json', 'Output as JSON', false)
  .action((field: string, rtValue: string, jiraValue: string, opts) => {
    try {
      const validFields = ['priority', 'status', 'type'];
      if (!validFields.includes(field)) {
        console.error(`Invalid field: ${field}. Must be one of: ${validFields.join(', ')}`);
        process.exit(1);
      }

      const mapping = getJiraFieldMapping();
      const fieldKey = field as keyof JiraFieldMapping;
      mapping[fieldKey][rtValue] = jiraValue;
      setJiraFieldMapping(mapping);

      if (opts.json) {
        outputResult({ field, rtValue, jiraValue, mapping }, true);
      } else {
        console.log(`Mapped ${field}: ${rtValue} -> ${jiraValue}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

mapCommand
  .command('reset')
  .description('Reset field mappings to defaults')
  .option('--json', 'Output as JSON', false)
  .action((opts) => {
    try {
      resetJiraFieldMapping();
      const mapping = getJiraFieldMapping();

      if (opts.json) {
        outputResult({ reset: true, mapping }, true);
      } else {
        console.log('Field mappings reset to defaults.');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
