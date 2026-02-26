# Rice-Tracker vs Beads: Comparative Analysis

**Date:** 2026-02-25
**Purpose:** Deep comparison of rice-tracker (rt) and beads (bd) issue tracking systems to guide rt development as a reliable, team-friendly alternative to beads.

---

## Executive Summary

**Rice-Tracker (rt)** is a cloud-first, Firebase-powered CLI issue tracker with Jira integration, designed for team workflows with a centralized database. **Beads (bd)** is a git-native, distributed issue tracker purpose-built for AI agents and multi-session coding workflows, with dependency-aware task management and semantic memory compaction.

Rice-tracker was created as a **personal, reliable alternative to beads**, specifically to address beads' dependability issues in team settings. Firebase/Firestore gives rt instant consistency and cloud-native reliability that beads' Dolt-based distributed model struggles with.

---

## Architecture Comparison

| Dimension | Rice-Tracker (rt) | Beads (bd) |
|---|---|---|
| **Language** | TypeScript (Node.js 22+) | Go (CLI), Python (MCP server) |
| **Storage** | Firebase Firestore (cloud) | Dolt/SQLite + JSONL (git-backed, local) |
| **ID Format** | `rt-xxxxxx` (nanoid 6-char) | `bd-xxxxxx` (hash) or `bd-1` (counter) or `bd-xxx.1.2` (hierarchical) |
| **Network** | Required for all data ops | Fully offline, sync via git push/pull |
| **Auth** | Firebase Auth (optional, falls back to anonymous) | None built-in (git-level access) |
| **Build** | tsup (ESM) | Go binary + npm distribution |
| **CLI Framework** | Commander.js | Custom Go CLI |
| **Test Framework** | Vitest (4 test files) | Go testing (extensive) |

---

## Feature-by-Feature Comparison

| Feature | rt | bd | Notes |
|---|---|---|---|
| **Issue CRUD** | Yes | Yes | Both have create/list/show/update/close |
| **Dependencies** | `blocks`, `related`, `parent_child`, `discovered_from` | `blocks`, `related`, `parent-child`, `discovered-from`, `duplicates`, `supersedes`, `replies_to` | bd has 7 types vs rt's 4 |
| **Ready queue** | Yes (BFS, pure function) | Yes (built-in) | Both compute unblocked work; rt fetches all docs each time |
| **Epics** | Yes (parentId + childIndex) | Yes (hierarchical IDs, up to 3 levels) | bd supports deeper nesting |
| **Labels/Tags** | Yes (color + description) | Via metadata JSON | rt has first-class labels; bd uses extensible metadata |
| **Comments** | Yes (threaded) | Yes (via `replies_to` dependency + message type) | rt has dedicated comments; bd models comments as issues |
| **Audit trail** | AuditEvent documents per mutation | Full Dolt version history | bd gets audit "for free" via Dolt git history |
| **Content hash** | SHA-256 truncated to 16 hex | Yes | Both use content hashing for change detection |
| **JSON output** | `--json` on every command | `--json` on every command | Parity |
| **Jira integration** | Full bidirectional sync | Via `external_ref` field | rt has deep Jira integration; bd has lightweight linking |
| **GitHub integration** | None | Push/pull issues, PR sync | bd wins here |
| **Offline support** | No (requires Firebase) | Yes (fully local) | Major architectural difference |
| **Multi-agent support** | Not designed for it | Core design goal | bd has agent state, work pinning, routing |
| **Memory compaction** | None | Semantic summarization of old issues | bd-unique feature for context window management |
| **Workflow templates** | None | Formulas (TOML templates), Molecules, Wisps | bd has a full workflow system |
| **Async coordination** | None | Gates (human, timer, GitHub CI) | bd-unique |
| **Web UI** | None | None (community extensions exist) | Neither has built-in web UI |
| **Scheduling** | None | `due_at`, `defer_until` | bd has time-based features |
| **MCP integration** | None | Full MCP server (Python) | bd is a native AI tool |
| **Decision tracking** | None | `decision` issue type + `/beads:decision` | bd-unique |
| **Export/Import** | None | JSONL export/import | bd supports data portability |
| **Health checks** | None | `bd doctor --fix` | bd has self-healing |

---

## Pros & Cons

### Rice-Tracker Pros

1. **Firebase = instant consistency** - Every team member sees the same state immediately, no sync required. Directly solves beads' team reliability problem.
2. **Cloud-native reliability** - Firestore has 99.999% SLA. No local database corruption, no merge conflicts, no Dolt quirks.
3. **You own the code** - When beads breaks, you're at the mercy of upstream fixes. With rt, you fix it yourself.
4. **Clean layered architecture** - Commands -> Services -> Firebase separation is consistent and well-enforced.
5. **Deep Jira integration** - Full bidirectional sync with ADF parsing, custom field mapping, push/pull/sync.
6. **Strong TypeScript strict mode** - End-to-end type safety including Firestore converters.
7. **Pure function graph algorithms** - BFS cycle detection and ready-queue are well-tested (18 cases) and easy to maintain.
8. **Colored labels** - First-class label taxonomy with hex color support.
9. **Audit events with field-level diffs** - Every mutation records exactly what changed.
10. **`--json` on every command** - First-class automation and AI-agent target.

### Rice-Tracker Cons

1. **Requires network connectivity** - Cannot work offline; every command hits Firestore.
2. **Firebase vendor lock-in** - Hard dependency on Google Cloud; no local/self-hosted fallback.
3. **No agent/AI integration (MCP)** - No MCP server, no agent state management, no context window awareness.
4. **Limited test coverage** - Only 2 test files covering pure functions; no service or command tests.
5. **Labels stored by name, not ID** - Deleting a label orphans references on issues silently.
6. **No atomic batch writes** - Issue creation + audit event are separate writes; crash between them loses the event.
7. **Full collection scans for ready queue** - `getDocs(issuesCollection)` won't scale past hundreds of issues.
8. **Epic command breaks layered architecture** - `epic.ts` imports Firestore directly, bypassing services.
9. **No workflow/template system** - No way to define reusable processes.
10. **Auth is vestigial** - `signIn` exists but no CLI command invokes it; silently falls back to "anonymous".
11. **No export/import** - Data is locked in Firestore.
12. **Jira sync has no conflict resolution** - Pull always overwrites local changes.

### Beads Pros

1. **Fully offline/distributed** - Works without network; syncs via git push/pull.
2. **Purpose-built for AI agents** - MCP server, `--json` everywhere, agent state machine, memory compaction.
3. **Rich dependency model** - 7 relationship types vs rt's 4.
4. **Git-native version history** - Full audit trail via Dolt.
5. **Workflow system** - Formulas (templates), Molecules (instances), Wisps (ephemeral), Gates (async coordination).
6. **Memory compaction** - Semantic summarization of old issues preserves context window budget.
7. **Hierarchical IDs** - Up to 3 levels deep for epic subtasks (`bd-xxx.1.2`).
8. **Decision tracking** - First-class `decision` issue type.
9. **Data portability** - JSONL export/import.
10. **Self-healing** - `bd doctor --fix` detects and repairs database issues.

### Beads Cons

1. **Not dependable** - Reliability issues are a recurring problem, especially in team/multi-user settings. This is a critical flaw for production use.
2. **Dolt complexity** - Git-backed storage introduces merge edge cases, sync fragility, and database corruption that Firebase avoids entirely.
3. **No centralized real-time state** - Distributed model means teammates can have divergent state until someone explicitly syncs.
4. **Compaction is destructive** - Summarizing old issues permanently loses detail; risky for teams that need full auditability.
5. **Steep learning curve** - Dependencies + workflows + gates + formulas + Dolt concepts are a lot to absorb.
6. **No built-in permissions/RBAC** - Access control is at the git level only.
7. **No first-class labels** - Must use metadata JSON for tagging.
8. **No deep Jira integration** - Only lightweight `external_ref` linking; no field mapping or bidirectional sync.
9. **No centralized real-time collaboration** - Updates require explicit sync; no "everyone sees changes instantly".
10. **Upstream dependency** - When beads breaks, you wait for upstream fixes.

---

## Detailed Gap Analysis

### Gaps in Rice-Tracker (features beads has that rt needs)

| Priority | Gap | Why It Matters | Effort |
|---|---|---|---|
| **P0** | MCP server / Claude Code plugin | Beads' killer feature - native AI agent integration. Without it, rt can't replace beads in AI workflows. | Medium-High |
| **P0** | Export/Import (JSONL) | Data portability and backup. Firebase lock-in is a real risk. | Low |
| **P1** | Memory compaction / context-aware summaries | Long AI sessions need this to manage context windows. Could be a "summarize closed issues older than X" command. | Medium |
| **P1** | `rt login` command | Wire up existing Firebase Auth code. Team use requires identity. | Low |
| ~~**P1**~~ | ~~Decision tracking (`rt decision`)~~ | ~~First-class architectural decision records. Simple new issue type + command.~~ | ✅ Shipped in `7882053` |
| **P2** | Workflow templates | Reusable process definitions (like beads' formulas). Could be YAML/JSON templates that create sets of linked issues. | Medium |
| **P2** | GitHub integration | Sync issues with GitHub Issues/PRs. Useful alongside Jira. | Medium |
| ~~**P2**~~ | ~~Scheduling (`--defer-until`, `--due`)~~ | ~~Two new date fields on issues. Low-hanging fruit.~~ | ✅ Shipped in `7882053` |
| ~~**P2**~~ | ~~`rt doctor` health check~~ | ~~Validate Firestore data integrity, find orphaned deps/labels.~~ | ✅ Shipped in `7882053` |
| ~~**P3**~~ | ~~Additional dependency types~~ | ~~Add `duplicates`, `supersedes`, `replies_to`.~~ | ✅ Shipped in `7882053` |
| **P3** | Hierarchical IDs | `rt-xxx.1.2` style for epic subtasks. | Low-Medium |

### Gaps in Beads (features rt has that beads lacks)

| Gap | Severity | Impact |
|---|---|---|
| **No deep Jira integration** | High | Only `external_ref` linking; no bidirectional field sync, no custom mapping |
| **No centralized real-time data** | Medium | Requires explicit sync; no instant visibility across team |
| **No first-class colored labels** | Low | Must use metadata JSON; less ergonomic for categorization |
| **No Firebase Auth integration** | Low | No managed identity provider |

---

## Technical Debt in Rice-Tracker (to address)

| Issue | File | Impact |
|---|---|---|
| Labels stored by name, not ID | `src/types/index.ts:16` | Silent orphan references on label delete |
| Full collection scans in ready queue | `src/services/dependency-service.ts:249-263` | Won't scale past hundreds of issues |
| `getBlockers` has N+1 queries | `src/services/dependency-service.ts:207-226` | Performance issue at scale |
| `contentHash` unused in sync logic | `src/services/sync-service.ts` | Missed conflict detection opportunity |
| No `.env` auto-loading | `src/firebase/client.ts` | Onboarding friction |
| No `rt login` command | N/A | Firebase Auth is wired but inaccessible via CLI |

---

## Recommended Development Roadmap

### Phase 1: Foundation (Close Critical Gaps)
- [ ] Build MCP server for Claude Code integration
- [ ] Add JSONL export/import commands
- [ ] Implement `rt login` / `rt auth` command
- [ ] Fix epic command to use service layer
- [ ] Add `.env` auto-loading (dotenv)

### Phase 2: AI-Native Features
- [ ] Memory compaction / context summarization
- [ ] Decision tracking (`rt decision`)
- [ ] Add `defer_until` and `due_at` fields
- [ ] `rt doctor` health check command

### Phase 3: Workflow & Integration
- [ ] Workflow templates (YAML/JSON)
- [ ] GitHub integration (issues + PRs)
- [ ] Additional dependency types
- [ ] Hierarchical IDs for deep nesting

### Phase 4: Hardening
- [ ] Firestore batch writes for atomic operations
- [ ] Pagination for `rt list` and ready queue
- [ ] Fix N+1 queries in `getBlockers`
- [ ] Labels by ID (migration needed)
- [ ] Expand test coverage to services and commands
- [ ] Use `contentHash` in Jira sync conflict detection

---

## Philosophical Difference

Rice-tracker and beads solve overlapping but fundamentally different problems:

- **Beads** is an **agent memory system** that happens to track issues. It's designed for AI agents managing their own work across sessions.
- **Rice-tracker** is a **team collaboration tool** built for reliability. Firebase gives it the instant consistency and cloud-native SLA that beads' distributed model can't match.

rt's advantage is that it's **yours** - you control the code, the infrastructure, and the roadmap. When beads breaks in a team setting, you're stuck. When rt has a gap, you close it.

---

*Generated by Claude Code agent team analysis - 2026-02-25*



-  Phase 1:  foundation                                                                      
      208 -  Phase 2:  quick-features  |  mcp-server      (parallel)                                   
      209 -  Phase 3:  github-integration  |  memory-compaction  (parallel)                            
      210 -  Phase 4:  tech-debt-hardening → hierarchical-ids  (sequential)  