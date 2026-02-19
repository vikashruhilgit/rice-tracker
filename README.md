# rt (rice-tracker)

[![CI](https://github.com/vikashruhilgit/rice-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/vikashruhilgit/rice-tracker/actions/workflows/ci.yml)
[![Claude Code Review](https://github.com/vikashruhilgit/rice-tracker/actions/workflows/claude-code-review.yml/badge.svg)](https://github.com/vikashruhilgit/rice-tracker/actions/workflows/claude-code-review.yml)

A Firebase-powered issue tracker CLI built for teams and AI agents. Cloud-first, real-time sync, with dependency graphs and Jira integration.

| Feature | rt | Traditional trackers |
|---------|-----|---------------------|
| **Storage** | Firebase Firestore (cloud) | Local files or hosted DB |
| **Sync** | Real-time across all clients | Manual refresh / polling |
| **Offline** | Firestore offline persistence | Varies |
| **Agent-friendly** | `--json` on every command | Usually not |
| **Dependencies** | Transitive graph resolution | Flat or none |
| **Jira** | Bi-directional sync | One-way or none |

---

## Installation

### Prerequisites

- **Node.js** 22 or higher — [download here](https://nodejs.org/)

### Install via npm

```bash
npm install -g rice-tracker
```

### Install via yarn

```bash
yarn global add rice-tracker
```

### Install via npx (no install, run directly)

```bash
npx rice-tracker --help
npx rice-tracker create "My first issue"
```

### Verify installation

```bash
rt --version      # 0.1.0
rt --help
```

### Install from source (for contributors)

```bash
git clone https://github.com/vikashruhilgit/rice-tracker.git
cd rice-tracker
npm install
npm run build
npm link          # makes `rt` available globally
```

---

## Firebase Setup (Step by Step)

rt uses Firebase Firestore as its database. You need a Firebase project before using rt. This is a one-time setup.

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** (or "Add project")
3. Enter a project name (e.g., `my-team-tracker`)
4. Disable Google Analytics if you don't need it (optional)
5. Click **"Create project"** and wait for it to finish

### Step 2: Enable Firestore Database

1. In your Firebase project, go to **Build > Firestore Database** in the left sidebar
2. Click **"Create database"**
3. Choose a location closest to your team (e.g., `us-central1`, `asia-south1`)
4. Select **"Start in test mode"** for now (you can tighten security rules later)
5. Click **"Create"**

### Step 3: Register a Web App

1. In Firebase Console, click the **gear icon** (top left) > **Project settings**
2. Scroll down to **"Your apps"** section
3. Click the **Web icon** (`</>`) to add a web app
4. Enter a nickname (e.g., `rt-cli`)
5. Skip Firebase Hosting (not needed)
6. Click **"Register app"**
7. You'll see a config object like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "my-team-tracker.firebaseapp.com",
  projectId: "my-team-tracker",
  storageBucket: "my-team-tracker.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

**Copy these values** — you'll need them in the next step.

### Step 4: Configure rt with your Firebase credentials

Set environment variables in your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.bash_profile`):

```bash
# Add to your ~/.zshrc or ~/.bashrc
export RT_FIREBASE_API_KEY="AIzaSyB..."
export RT_FIREBASE_AUTH_DOMAIN="my-team-tracker.firebaseapp.com"
export RT_FIREBASE_PROJECT_ID="my-team-tracker"
export RT_FIREBASE_STORAGE_BUCKET="my-team-tracker.firebasestorage.app"
export RT_FIREBASE_MESSAGING_SENDER_ID="123456789"
export RT_FIREBASE_APP_ID="1:123456789:web:abc123def456"
```

Then reload your shell:

```bash
source ~/.zshrc    # or source ~/.bashrc
```

**Alternative: use a `.env` file** in your project directory:

```bash
# .env (add to .gitignore — never commit this file)
RT_FIREBASE_API_KEY=AIzaSyB...
RT_FIREBASE_AUTH_DOMAIN=my-team-tracker.firebaseapp.com
RT_FIREBASE_PROJECT_ID=my-team-tracker
RT_FIREBASE_STORAGE_BUCKET=my-team-tracker.firebasestorage.app
RT_FIREBASE_MESSAGING_SENDER_ID=123456789
RT_FIREBASE_APP_ID=1:123456789:web:abc123def456
```

### Step 5: Initialize rt

```bash
rt init --project-id my-team-tracker
```

This stores the project config locally. All issues will live under `projects/my-team-tracker/` in Firestore.

### Step 6 (Optional): Set up Firestore Security Rules

For team usage, go to **Firebase Console > Firestore Database > Rules** and set:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId}/{document=**} {
      // Allow authenticated users to read/write
      allow read, write: if request.auth != null;
    }
  }
}
```

> For personal/testing use, the default "test mode" rules are fine. For production team usage, configure proper auth rules.

### Step 7 (Optional): Enable Firebase Authentication

If you want user identity tracking (who created/updated issues):

1. Go to **Build > Authentication** in Firebase Console
2. Click **"Get started"**
3. Enable **Email/Password** sign-in method
4. Create user accounts for your team members

Without auth, rt works fine — it just records `anonymous` as the user.

---

## Quick Start

After installation and Firebase setup:

```bash
# Initialize
rt init --project-id my-project

# Create issues
rt create "Set up CI pipeline" -p 1 -t task
rt create "Fix login redirect bug" -p 0 -t bug
rt create "Add dark mode" -p 3

# List all issues
rt list

# Filter issues
rt list -s open -p 1

# Show details
rt show rt-a1b2c3

# Update an issue
rt update rt-a1b2c3 -s in_progress -a "vikash"

# Close when done
rt close rt-a1b2c3
```

---

## Commands

### Issue Management

```bash
# Create
rt create <title> [options]
  -d, --description <text>     Issue description
  -t, --type <type>            task | bug | epic | message (default: task)
  -p, --priority <n>           0=critical, 1=high, 2=medium, 3=low (default: 2)
  -a, --assignee <user>        Assign to user
  -l, --labels <labels>        Comma-separated labels
  --json                       JSON output

# List
rt list [options]
  -s, --status <status>        Filter: open | in_progress | closed
  -p, --priority <n>           Filter: 0-3
  -a, --assignee <user>        Filter by assignee
  -t, --type <type>            Filter by type
  -l, --label <label>          Filter by label
  --json                       JSON output

# Show details
rt show <id> [--json]

# Update
rt update <id> [options]
  -t, --title <text>           New title
  -d, --description <text>     New description
  --type <type>                Change type
  -p, --priority <n>           Change priority
  -s, --status <status>        Change status
  -a, --assignee <user>        Change assignee
  --json                       JSON output

# Close
rt close <id> [--json]
```

### Dependencies

Issues can block each other. The `ready` command uses transitive dependency resolution to find work you can actually start.

```bash
# Add a dependency (A blocks B)
rt dep add <from-id> <to-id> [--type blocks|related|parent_child|discovered_from]

# Remove a dependency
rt dep remove <from-id> <to-id>

# List dependencies for an issue
rt dep list <id>

# Find issues with no unresolved blockers
rt ready [--priority <n>] [--json]
```

**Dependency types:**
- `blocks` — target cannot start until source is closed (default)
- `related` — informational link, no blocking
- `parent_child` — hierarchical relationship
- `discovered_from` — traceability link

**Example:**

```bash
rt create "Design API schema" -p 1        # rt-a1b2
rt create "Implement API endpoints" -p 1   # rt-c3d4
rt create "Write API tests" -p 2           # rt-e5f6

rt dep add rt-a1b2 rt-c3d4                 # schema blocks endpoints
rt dep add rt-c3d4 rt-e5f6                 # endpoints block tests

rt ready
# Only shows rt-a1b2 (the others are transitively blocked)
```

### Epics

Group related issues into hierarchical epics with numbered children.

```bash
# Create an epic
rt epic create <title> [-d description] [-p priority] [--json]

# Add a child issue to an epic
rt epic add-child <epicId> <childId> [--json]

# List all epics
rt epic list [--json]

# Show epic with children tree
rt epic show <id> [--json]
```

**Example:**

```bash
rt epic create "User Authentication" -p 1   # rt-x1y2
rt create "JWT token service" -p 1          # rt-a1b2
rt create "Login endpoint" -p 1             # rt-c3d4
rt epic add-child rt-x1y2 rt-a1b2          # child #1
rt epic add-child rt-x1y2 rt-c3d4          # child #2

rt epic show rt-x1y2
# User Authentication (epic)
# Children (2):
#   1. rt-a1b2 JWT token service [open] P1-high
#   2. rt-c3d4 Login endpoint [open] P1-high
```

### Labels

Tag issues with colored labels for categorization.

```bash
# Create a label
rt label create <name> [--color #hex] [--description text] [--json]

# List all labels
rt label list [--json]

# Delete a label
rt label delete <name> [--json]

# Add label to issue
rt label add <issueId> <labelName> [--json]

# Remove label from issue
rt label remove <issueId> <labelName> [--json]
```

### Comments

Add threaded comments to issues for discussion and audit.

```bash
# Add a comment
rt comment add <issueId> "comment body" [--thread <commentId>] [--json]

# List comments
rt comment list <issueId> [--json]
```

### Configuration

```bash
# Initialize project
rt init --project-id <id> [--timezone <tz>]

# Set config values
rt config set timezone America/New_York
rt config set defaultPriority 1
rt config set defaultType task

# Get a config value
rt config get timezone

# List all config
rt config list [--json]
```

### Jira Integration

Bi-directional sync between rt and Jira.

#### Connect to Jira

First, get a Jira API token:

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token"**
3. Give it a label (e.g., `rt-cli`)
4. Copy the token

Then connect:

```bash
rt jira connect \
  --host your-org.atlassian.net \
  --email you@company.com \
  --token your-api-token \
  --project-key PROJ
```

#### Sync Commands

```bash
# Push an rt issue to Jira (creates or updates)
rt jira push <id> [--json]

# Pull issues from Jira into rt
rt jira pull [--jql "project = PROJ AND status != Done"] [--json]

# Bi-directional sync (pull first, then push unsynced)
rt jira sync [--json]
```

#### Field Mapping

```bash
# View current field mapping
rt jira map show [--json]

# Customize field mapping
rt jira map set priority 0 Blocker
rt jira map set status in_progress "In Review"

# Reset to defaults
rt jira map reset [--json]
```

**Default field mapping:**

| rt | Jira |
|----|------|
| Priority 0 | Highest |
| Priority 1 | High |
| Priority 2 | Medium |
| Priority 3 | Low |
| open | To Do |
| in_progress | In Progress |
| closed | Done |
| task | Task |
| bug | Bug |
| epic | Epic |
| message | Story |

---

## Agent / Automation Usage

Every command supports `--json` for machine-readable output:

```bash
# Create and capture the ID
ISSUE=$(rt create "Fix login bug" -p 0 -t bug --json)
ID=$(echo "$ISSUE" | jq -r '.id')

# Query ready work
rt ready --json | jq '.[].id'

# Pipeline: create, add deps, find ready work
rt create "Task A" --json | jq -r '.id'    # rt-aaa
rt create "Task B" --json | jq -r '.id'    # rt-bbb
rt dep add rt-aaa rt-bbb
rt ready --json                             # returns [rt-aaa]
```

---

## Timezone Handling

- **Storage:** All timestamps are UTC (ISO 8601 / Firestore `Timestamp`)
- **Display:** Converted to the configured timezone on every read
- **Configuration:** `rt config set timezone America/New_York`
- **Default:** Uses your system timezone if not configured
- **Multi-user:** Each user sees their own local time for the same issue

Supports all [IANA timezone identifiers](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (e.g., `America/Chicago`, `Europe/London`, `Asia/Kolkata`).

---

## Firestore Data Model

All data lives under `projects/{projectId}/` in Firestore:

```
projects/{projectId}/
  issues/{issueId}         # Issue documents
  dependencies/{depId}     # Dependency graph edges
  comments/{commentId}     # Issue comments
  labels/{labelId}         # Label definitions
  events/{eventId}         # Audit trail (auto-generated)
```

**Timestamps** are stored as UTC `Timestamp` objects and converted to local timezone for display.

**IDs** are hash-based (`rt-xxxxxx`) using nanoid, collision-resistant and URL-safe.

---

## Publishing to npm

If you are a contributor and want to publish a new version:

```bash
# 1. Update version in package.json
npm version patch    # or minor / major

# 2. Build (runs automatically via prepublishOnly)
npm run build

# 3. Login to npm
npm login

# 4. Publish
npm publish

# 5. Verify
npm info rice-tracker
```

After publishing, anyone can install with `npm install -g rice-tracker`.

---

## Development

```bash
# Clone
git clone https://github.com/vikashruhilgit/rice-tracker.git
cd rice-tracker
npm install

# Run in dev mode (no build step)
npm run dev -- create "test issue"

# Build
npm run build

# Run tests
npm test

# Type-check
npx tsc --noEmit
```

### Project Structure

```
src/
  index.ts                  # CLI entry point
  commands/                 # Commander.js command definitions
    init.ts                 # rt init
    create.ts               # rt create
    list.ts                 # rt list
    show.ts                 # rt show
    update.ts               # rt update
    close.ts                # rt close
    config.ts               # rt config
    dep.ts                  # rt dep
    ready.ts                # rt ready
    epic.ts                 # rt epic
    label.ts                # rt label
    comment.ts              # rt comment
    jira/                   # rt jira *
      connect.ts
      push.ts
      pull.ts
      sync.ts
      map.ts
  services/                 # Business logic
    issue-service.ts        # Issue CRUD + audit trail
    dependency-service.ts   # Graph resolution + ready-work
    jira-service.ts         # Jira API wrapper
    sync-service.ts         # Bi-directional Jira sync
    time-service.ts         # UTC/timezone conversion
  firebase/                 # Firebase layer
    client.ts               # App + Firestore singleton
    collections.ts          # Collection references
    auth.ts                 # Auth helpers
  models/                   # Validators + Firestore converters
  types/                    # TypeScript interfaces
  utils/                    # ID generation, config, formatting
tests/
  services/
    dependency-service.test.ts   # Graph algorithm tests (18)
    time-service.test.ts         # Timezone tests (17)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 (strict) |
| Runtime | Node.js 22 |
| Build | tsup (esbuild) |
| CLI | Commander.js |
| Database | Firebase Firestore |
| Auth | Firebase Auth |
| Jira | jira.js |
| Timezone | date-fns + date-fns-tz |
| Output | chalk + cli-table3 |
| Config | conf (XDG-compliant) |
| Testing | Vitest |

---

## Troubleshooting

### "No project configured. Run `rt init` first."

You haven't initialized a project yet. Run:

```bash
rt init --project-id your-firebase-project-id
```

### "Firebase: No Firebase App has been created"

Your Firebase environment variables are not set. Make sure `RT_FIREBASE_PROJECT_ID` and other `RT_FIREBASE_*` variables are exported in your shell. Verify with:

```bash
echo $RT_FIREBASE_PROJECT_ID
```

### "Permission denied" on Firestore

Your Firestore security rules are blocking access. Either:
- Use test mode rules (for development)
- Set up Firebase Auth and sign in
- Check your rules in Firebase Console > Firestore > Rules

### "command not found: rt"

If you installed globally but `rt` isn't found:

```bash
# npm
npm list -g rice-tracker          # verify it's installed
npx rice-tracker --help           # use npx as fallback

# yarn
yarn global bin                    # check yarn's global bin path
export PATH="$(yarn global bin):$PATH"
```

---

## License

MIT - see [LICENSE](./LICENSE)
