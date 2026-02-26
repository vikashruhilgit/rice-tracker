import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { createCommand } from './commands/create.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { updateCommand } from './commands/update.js';
import { closeCommand } from './commands/close.js';
import { depCommand } from './commands/dep.js';
import { readyCommand } from './commands/ready.js';
import { jiraCommand } from './commands/jira/index.js';
import { githubCommand } from './commands/github/index.js';
import { epicCommand } from './commands/epic.js';
import { labelCommand } from './commands/label.js';
import { commentCommand } from './commands/comment.js';
import { loginCommand } from './commands/auth.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { decisionCommand } from './commands/decision.js';
import { doctorCommand } from './commands/doctor.js';
import { compactCommand } from './commands/compact.js';
import { startMcpServer } from './mcp/index.js';

const program = new Command();

program
  .name('rt')
  .description('Firebase-powered issue tracker CLI')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(updateCommand);
program.addCommand(closeCommand);
program.addCommand(depCommand);
program.addCommand(readyCommand);
program.addCommand(jiraCommand);
program.addCommand(githubCommand);
program.addCommand(epicCommand);
program.addCommand(labelCommand);
program.addCommand(commentCommand);
program.addCommand(loginCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(decisionCommand);
program.addCommand(doctorCommand);
program.addCommand(compactCommand);

program
  .command('mcp')
  .description('Start the MCP server (stdio transport) for Claude Code integration')
  .action(async () => {
    await startMcpServer();
  });

program.parse();
