import { Command } from 'commander';
import { connectCommand } from './connect.js';
import { pushCommand } from './push.js';
import { pullCommand } from './pull.js';
import { linkPrCommand } from './link-pr.js';

export const githubCommand = new Command('github')
  .description('GitHub integration commands');

githubCommand.addCommand(connectCommand);
githubCommand.addCommand(pushCommand);
githubCommand.addCommand(pullCommand);
githubCommand.addCommand(linkPrCommand);
