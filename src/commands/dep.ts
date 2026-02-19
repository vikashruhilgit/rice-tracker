import { Command } from 'commander';
import type { DependencyType } from '../types/index.js';
import {
  addDependency,
  removeDependency,
  getDependencies,
} from '../services/dependency-service.js';
import { outputResult } from '../utils/formatter.js';

export const depCommand = new Command('dep')
  .description('Manage issue dependencies');

depCommand
  .command('add')
  .description('Add a dependency between two issues')
  .argument('<from>', 'Source issue ID')
  .argument('<to>', 'Target issue ID')
  .option('-t, --type <type>', 'Dependency type (blocks|related|parent_child|discovered_from)', 'blocks')
  .option('--json', 'Output as JSON', false)
  .action(async (from: string, to: string, opts) => {
    try {
      const type = opts.type as DependencyType;
      const dep = await addDependency(from, to, type);

      if (opts.json) {
        outputResult(dep, true);
      } else {
        console.log(`Dependency added: ${dep.fromId} --[${dep.type}]--> ${dep.toId} (${dep.id})`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

depCommand
  .command('remove')
  .description('Remove a dependency between two issues')
  .argument('<from>', 'Source issue ID')
  .argument('<to>', 'Target issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (from: string, to: string, opts) => {
    try {
      await removeDependency(from, to);

      if (opts.json) {
        outputResult({ removed: true, from, to }, true);
      } else {
        console.log(`Dependency removed: ${from} -> ${to}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

depCommand
  .command('list')
  .description('List all dependencies for an issue')
  .argument('<id>', 'Issue ID')
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts) => {
    try {
      const deps = await getDependencies(id);

      if (opts.json) {
        outputResult(deps, true);
      } else {
        if (deps.length === 0) {
          console.log(`No dependencies found for ${id}.`);
        } else {
          for (const dep of deps) {
            const direction = dep.fromId === id ? '->' : '<-';
            const other = dep.fromId === id ? dep.toId : dep.fromId;
            console.log(`  ${dep.id}  ${id} ${direction} ${other}  [${dep.type}]`);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
