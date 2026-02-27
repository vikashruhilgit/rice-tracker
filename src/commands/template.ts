import { Command } from 'commander';
import {
  loadTemplate,
  listTemplates,
  applyTemplate,
  substituteVariables,
} from '../services/template-service.js';
import { outputResult } from '../utils/formatter.js';

const templateApply = new Command('apply')
  .description('Apply a workflow template, creating a set of linked issues')
  .argument('<name>', 'Template name (slug) or path to template file')
  .option('--var <key=value>', 'Set a template variable (can repeat)', (val: string, acc: string[]) => [...acc, val], [] as string[])
  .option('--json', 'Output as JSON', false)
  .action(async (name: string, opts) => {
    try {
      // Parse --var key=value pairs
      const vars: Record<string, string> = {};
      for (const entry of opts.var as string[]) {
        const eqIdx = entry.indexOf('=');
        if (eqIdx === -1) {
          console.error(`Error: --var "${entry}" must be in key=value format`);
          process.exit(1);
        }
        vars[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
      }

      const { template } = loadTemplate(name);
      const resolved = substituteVariables(template, vars);
      const result = await applyTemplate(resolved);

      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log(`Template "${template.name}" applied — created ${result.created.length} issue(s):`);
        for (const issue of result.created) {
          console.log(`  ${issue.rtId}  [${issue.localId}]  ${issue.title}`);
        }
        if (result.dependencies.length > 0) {
          console.log(`\nDependencies created (${result.dependencies.length}):`);
          for (const dep of result.dependencies) {
            console.log(`  ${dep.from} --[${dep.type}]--> ${dep.to}`);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const templateList = new Command('list')
  .description('List available templates in .rt/templates/')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const templates = listTemplates();

      if (opts.json) {
        outputResult(templates, true);
      } else {
        if (templates.length === 0) {
          console.log('No templates found. Add YAML/JSON files to .rt/templates/');
        } else {
          for (const t of templates) {
            console.log(`  ${t.name}  (${t.issueCount} issue${t.issueCount !== 1 ? 's' : ''})  ${t.path}`);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const templateCommand = new Command('template')
  .description('Manage and apply workflow templates from .rt/templates/')
  .addCommand(templateApply)
  .addCommand(templateList);
