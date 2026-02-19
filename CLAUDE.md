# rice-tracker (rt)

Firebase-powered issue tracker CLI.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 22+
- **Build:** tsup (ESM output)
- **Test:** vitest
- **Lint:** eslint
- **CLI framework:** Commander.js

## Commands

```bash
npm run build    # Build with tsup
npm run test     # Run tests with vitest
npm run dev      # Run in dev mode with tsx
npm run lint     # Lint with eslint
```

## Conventions

- All timestamps stored as UTC, displayed in local timezone (date-fns-tz)
- CLI commands all support --json flag for agent consumption
- Firebase Firestore is the source of truth
- Hash-based IDs use rt-xxxx format (nanoid)
- Environment variables prefixed with RT_FIREBASE_ for Firebase config
- Source code lives in src/, built output in dist/
- Entry point: src/index.ts
- Firebase client singleton: src/firebase/client.ts
