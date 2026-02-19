import { Command } from 'commander';
import { connectCommand } from './connect.js';
import { pushCommand } from './push.js';
import { pullCommand } from './pull.js';
import { syncCommand } from './sync.js';
import { mapCommand } from './map.js';

export const jiraCommand = new Command('jira')
  .description('Jira integration commands');

jiraCommand.addCommand(connectCommand);
jiraCommand.addCommand(pushCommand);
jiraCommand.addCommand(pullCommand);
jiraCommand.addCommand(syncCommand);
jiraCommand.addCommand(mapCommand);
