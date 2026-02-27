import { Command } from 'commander';
import { signIn, getFirebaseAuth } from '../firebase/auth.js';
import { outputResult } from '../utils/formatter.js';

export const loginCommand = new Command('login')
  .description('Authenticate with Firebase using email/password')
  .requiredOption('--email <email>', 'Firebase account email')
  .requiredOption('--password <password>', 'Firebase account password')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const uid = await signIn(opts.email, opts.password);
      const auth = getFirebaseAuth();
      const email = auth.currentUser?.email ?? opts.email;

      if (opts.json) {
        outputResult({ uid, email }, true);
      } else {
        console.log(`Authenticated as ${email} (uid: ${uid})`);
      }
    } catch (error) {
      if (opts.json) {
        outputResult({ error: error instanceof Error ? error.message : String(error) }, true);
      } else {
        console.error('Login failed:', error instanceof Error ? error.message : error);
      }
      process.exit(1);
    }
  });
