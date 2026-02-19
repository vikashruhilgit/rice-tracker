import { Command } from 'commander';
import { getConfig, getProjectConfig, getCurrentProjectId } from '../utils/config.js';
import { outputResult } from '../utils/formatter.js';

const ALLOWED_KEYS = ['timezone', 'defaultPriority', 'defaultType'] as const;
type ConfigKey = (typeof ALLOWED_KEYS)[number];

export const configCommand = new Command('config')
  .description('Manage project configuration');

configCommand
  .command('set <key> <value>')
  .description('Set a config value')
  .option('--json', 'Output as JSON', false)
  .action((key: string, value: string, opts: { json: boolean }) => {
    try {
      if (!ALLOWED_KEYS.includes(key as ConfigKey)) {
        console.error(`Error: Unknown config key "${key}". Allowed: ${ALLOWED_KEYS.join(', ')}`);
        process.exit(1);
      }

      const projectId = getCurrentProjectId();
      const conf = getConfig();
      let parsed: string | number = value;

      if (key === 'defaultPriority') {
        parsed = parseInt(value, 10);
        if (![0, 1, 2, 3].includes(parsed)) {
          console.error('Error: defaultPriority must be 0-3');
          process.exit(1);
        }
      }

      conf.set(`projects.${projectId}.${key}`, parsed);

      if (opts.json) {
        outputResult({ key, value: parsed }, true);
      } else {
        console.log(`Set ${key} = ${parsed}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

configCommand
  .command('get <key>')
  .description('Get a config value')
  .option('--json', 'Output as JSON', false)
  .action((key: string, opts: { json: boolean }) => {
    try {
      const config = getProjectConfig();
      const value = config[key as keyof typeof config];
      if (value === undefined) {
        console.error(`Error: Unknown config key "${key}"`);
        process.exit(1);
      }

      if (opts.json) {
        outputResult({ key, value }, true);
      } else {
        console.log(`${key} = ${value}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

configCommand
  .command('list')
  .description('List all config values')
  .option('--json', 'Output as JSON', false)
  .action((opts: { json: boolean }) => {
    try {
      const config = getProjectConfig();

      if (opts.json) {
        outputResult(config, true);
      } else {
        console.log(`Project: ${config.projectId}`);
        console.log(`Timezone: ${config.timezone}`);
        console.log(`Default Priority: ${config.defaultPriority}`);
        console.log(`Default Type: ${config.defaultType}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
