import { Command } from 'commander';

const program = new Command();

program
  .name('rt')
  .description('Firebase-powered issue tracker CLI')
  .version('0.1.0');

// Commands will be registered here as they're built

program.parse();
