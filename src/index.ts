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

program.parse();
