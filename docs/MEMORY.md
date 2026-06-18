# Memory Architecture

AHO separates durable project memory from agent execution. Agents can be restarted, replaced, or run through different adapters. Project memory must remain available through AHO-managed files and artifacts.

This document defines the memory model. Repo-local memory is the default and compatibility mode. External-local memory is operational as an opt-in personal mode. Remote memory remains future work.

## 1. Why Separate Memory From Execution

Codex, Claude Code, local shell commands, and future runtimes are executors. They may have their own sessions or caches, but AHO must not rely on them as project truth.

Codex may also provide user-level memory for preferences, habits, and cross-project context. AHO must not duplicate that responsibility. AHO memory stores project facts and engineering evidence: Change artifacts, accepted Spec/Plan/Tasks, run artifacts, diffs, validation, audit, apply/close decisions, closeouts, archives, and maintenance candidates.

AHO keeps durable memory in explicit stores so every run can rebuild context from artifacts:

```text
Project marker -> Memory Resolver -> Durable Memory -> Context Projection -> Executor
```

Agent output becomes durable only after it is written back as files, events, logs, diffs, validation reports, reviews, or archived change evidence.

## 2. Memory Modes

AHO supports three memory modes at the architecture level.

| Mode | Source of truth | Intended use | Status |
| --- | --- | --- | --- |
| `repo-local` | Files inside the target repository | Default today, compatibility, portable/offline export | Implemented |
| `external-local` | AHO home on the user's machine | Personal multi-project target default | Implemented as opt-in |
| `remote` | Remote memory service | Team, cross-device, shared audit history | Future, unsupported |

`repo-local` is retained as compatibility and migration mode. It should not remain the long-term default for personal multi-project use.

`external-local` is the personal-first target because it keeps the business repository clean while still giving agents durable project memory.

`remote` is the future team and cross-device mode. In that mode the remote store is authoritative and the local store is a cache.

## 3. Repo-Local Mode

Repo-local mode stores memory in the target repository:

```text
AGENTS.md
docs/
harness/changes/
harness/evolution/
.agent-harness/runs/
```

This mode is useful for:

- current AHO implementation
- portable exports
- simple offline projects
- repositories that intentionally want Harness history in Git
- migration into external-local or remote stores

Repo-local mode is not the long-term default because it mixes product source with local agent work history, run logs, and private development state.

## 4. External-Local Mode

External-local mode keeps only lightweight project pointers in the target repository:

```text
AGENTS.md
.agent-harness/project.json
.agent-harness/.gitignore
```

Durable memory lives under AHO home:

```text
~/.agent-harness/projects/{project-id}/
  docs/
  harness/changes/
  harness/evolution/
  runs/
  indexes/
```

In personal mode, this external-local store is the source of truth. The target repository remains focused on product source, tests, public docs, and build configuration.

External-local mode enables:

- cleaner public repositories
- one user managing many projects
- easier backup or sync of AHO memory
- future migration to remote memory
- less risk of committing local run history

Phase 2E makes this mode usable with:

```powershell
aho harness init <project> --memory external-local
aho memory status <project>
aho change new/status/close <project>
aho run start <project> -- <command>
aho run codex <project> --prompt "..."
```

The target project remains the command working directory for local command and Codex runs. Run artifacts are written under the external memory root.

## 5. Remote Mode

Remote mode is for future team and cross-device workflows.

In remote mode:

- the remote memory service is authoritative
- local AHO memory is a cache
- tokens and credentials are never stored in the target repository
- local runs still write artifacts before sync
- conflicts require explicit versioning and audit rules

Remote mode is not part of the current implementation. It needs future decisions for sync protocol, auth, permissions, gateway/service shape, offline behavior, conflict handling, retention, and audit logs.

## 6. Project Marker

`.agent-harness/project.json` identifies the project to AHO.

The marker should be safe to keep in a repository when possible. It must not contain tokens, machine-specific secrets, user home paths, or remote credentials.

Expected marker responsibilities:

- schema version
- stable project id
- display name
- memory mode
- optional remote workspace id
- optional compatibility hints

The marker is not the memory store. It is an input to the Memory Resolver.

## 7. AGENTS.md Memory Map

`AGENTS.md` remains necessary even when durable memory is external. It is the first document most agents can discover without AHO-specific tooling.

`AGENTS.md` is a map, not a database. It should explain:

- what the project is
- which memory mode applies
- where the project marker is
- how durable memory is resolved
- the context loading order
- how to read active changes
- how to read archive history progressively
- how to read run artifacts
- how to handle unavailable memory

It should not explain the full memory architecture, remote implementation, or historical details. Those belong in `docs/` and Harness artifacts.

## 8. Context Projection

`context.md` is generated per run. It is a projection from durable memory into the format a disposable executor needs.

Context Projection is not a new memory store. It is the scoped input packet for one run. Phase 7E splits the core role-run projection into `RoleContextPacket`, `ChangeContextPacket`, and `EvidenceContextPacket`, but those packets are still rebuildable projections from Harness files and artifacts.

`context.md` may include:

- project summary
- active change summary
- spec and acceptance criteria
- plan and tasks
- AC mapping
- review status
- close gate summary
- relevant run instructions

`context.md` is not source of truth. If it conflicts with durable memory, durable memory wins.

`AGENTS.md` should route agents to the right sources; it should not grow into a full context database. Ordinary worker agents should receive only the current Change, accepted artifacts, role constraints, and selected evidence needed for their task. Full archive history, maintenance ledgers, raw logs, and unrelated demand context stay out of ordinary role packets unless an explicit maintenance role requests them.

## 9. Memory Unavailable Behavior

Memory may be unavailable because a project was cloned onto a new machine, AHO home was not synced, permissions are missing, the marker is stale, or a future remote service is offline.

If the marker exists but durable memory cannot be resolved, an agent must not infer hidden history from source code or chat. It should report that memory is unavailable and ask the user to attach, sync, initialize, or repair memory.

Allowed fallback:

- read public repository docs and source files
- identify missing memory explicitly
- perform only low-risk local analysis

Disallowed fallback:

- inventing active change history
- assuming archived decisions
- closing or evolving Harness state
- treating chat as durable memory

## 10. Multi-Workpad Memory Isolation

When several Workpads exist for one project, AHO must keep their memory boundaries explicit. This is especially important before bounded parallel workers exist, because a user can ask for a second independent demand while the first Workpad is still running, blocked, or waiting for a decision.

The v1 namespace contract is:

```text
project/stable
  accepted and applied stable project facts

change/{changeId}
  one Workpad's requirement understanding, Thread, decisions, proposals, and local evidence

run/{runId}
  context.md, stdout/stderr/jsonl, diffs, validation/audit artifacts, and diagnostics

agent/{roleId}/session/{sessionId}
  executor continuity only; not project truth
```

Allowed writes:

- coder-agent writes only assigned worktree proposal and run artifacts;
- orchestrator writes only the current Workpad Thread, decision records, and summary projections;
- validator writes validation artifacts;
- auditor writes audit artifacts;
- project-stable memory accepts facts only from applied source changes, accepted Spec/Plan/Tasks, accepted architecture/product docs, accepted Harness evolution, or explicit human memory acceptance.

Reads for a run should be projected from:

```text
project/stable + current change/{changeId} + selected related Workpad summaries
```

Other running Workpads may appear as "related in-progress work" summaries. Their diffs, proposals, raw logs, and transient conclusions must not be treated as project-stable facts.

Consolidation is a separate future workflow. Closing or archiving a Workpad does not automatically merge its local memory into `project/stable`; a future maintenance pass should produce candidates, conflicts, evidence, and human-gated acceptance. User-level preferences belong in Codex Memory, not in AHO project-stable memory unless the user explicitly turns them into project requirements or conventions.

If durable memory is unavailable, the Workbench must display repair/sync/initialize guidance. It must not infer hidden Workpad state from chat history or source files.

## 10A. AgentScope-Style Maintenance Model

The current Harness evolution mechanism is a lightweight compatibility path: archived evidence eventually creates `harness/evolution/pending.md`, and a human-triggered ECL evolution pass decides whether to apply a process change. That path remains valid, but it is not the final AHO memory model.

The target model borrows AgentScope Java's two-layer maintenance structure and Phase 6S starts implementing the AHO-owned version:

```text
append-only maintenance ledger
  raw events from archive, apply, failure, user feedback, doc drift, validation gaps, and terminal-demand closeouts

curated project memory / docs / evolution proposals
  candidate extraction -> scoring -> review -> human-gated apply
```

Rules:

- terminal demand closeouts and append-only maintenance ledger entries may be written automatically;
- remote PR merge success may create a terminal closeout with `terminalKind = merged`;
- generated maintenance index/cache files may be refreshed automatically;
- every five unreviewed terminal closeouts may trigger an independent maintenance review window;
- curated `project/stable` memory, canonical docs, ECL rules, product roadmap, and Harness templates require candidates, scores, reviews, and a human gate;
- running demand-conversation conclusions stay under `change/{changeId}` and must not enter `project/stable`;
- close/archive does not automatically merge local demand memory into stable memory;
- failed runs, discarded proposals, and blocked audit results remain historical evidence unless a later human-gated consolidation accepts a stable fact;
- applied and merged closeouts may coexist for one demand because local source application and remote merge success are different stability boundaries;
- future consolidation must surface conflicts and must not silently overwrite stable facts.

Future roles such as `documentation-agent`, `architecture-agent`, `evolution-agent`, `evolution-scorer`, and `evolution-reviewer` may create and evaluate candidates. They are evidence producers, not direct writers of canonical memory.

### Experience Lifecycle And Entropy Control

AHO product maintenance should treat current stable memory and current docs as compact derived memory, not as another archive. The raw evidence layer keeps detailed history; the curated layer should only retain facts that still change future agent behavior.

Every maintenance candidate that could affect `project/stable`, canonical docs, role guidance, architecture guidance, or Harness/process rules should receive one lifecycle resolution before it can be applied:

| Resolution | Meaning |
| --- | --- |
| `promote` | Move a repeated, current, evidence-backed lesson into stable memory, docs, rules, templates, lint, or role guidance after a human gate. |
| `merge` | Combine duplicate or overlapping lessons into one shorter current rule or memory entry. |
| `retire` | Remove or supersede stale current-state guidance when newer evidence contradicts it. |
| `archive-only` | Keep detailed or one-off history in closeouts, ledgers, archives, and evidence refs without injecting it into current memory. |
| `noop` | Record that existing current memory already covers the lesson or that evidence is too weak to act. |

Stable memory and long-lived docs should also have budget and drift signals. Soft budget pressure creates a scored maintenance candidate. Hard budget pressure may create a doc-refinement proposal. Current-state drift checks should look for old baseline, roadmap, or next-step language that newer closeouts or accepted docs supersede. None of these signals may silently rewrite canonical memory; they produce candidates, scores, reviews, reports, or background tasks for a later human-gated update.

### Maintenance Tiers And Role Scope

Phase 6S uses memory tiers for maintenance roles only:

| Tier | Contents | Default consumers |
| --- | --- | --- |
| hot window | latest five terminal closeouts | memory-maintenance-agent, documentation-agent, architecture-agent, evolution-agent |
| warm index | latest thirty closeout index entries | maintenance roles when scoring or finding repeated patterns |
| cold archive refs | older archive summaries and artifact refs | maintenance roles only when they need traceability |

Ordinary role agents do not receive this full maintenance window by default. Their context projections are smaller:

- `main/orchestrator-agent`: current demand summary, current stage, compact stable memory, lightweight maintenance status;
- `planning-agent`: user demand, project constraints, relevant prior demand summaries, planning artifact templates;
- `coder-agent`: accepted artifacts, current worktree/source context, relevant tests, validation rules, explicitly selected lessons only;
- `validator`: acceptance criteria, worktree/change target, changed files, validation commands;
- `auditor-agent`: spec/design/tasks, diff summary, validation evidence, risk checklist;
- `merge-reviewer` and landing roles: landing/PR/validation/audit evidence.

Raw stdout/stderr/jsonl, random run ids, temporary paths, screenshot paths, one-off failures, and stale contradicted candidates must not become stable memory candidates. Candidates should use fingerprints for dedupe, and later evidence may mark a candidate as `superseded`.

### Doc Budget Guard

Long-lived docs need soft and hard budgets so maintenance does not grow them indefinitely. Exceeding a soft budget creates a maintenance candidate for scoring. Exceeding a hard budget creates a doc-refinement maintenance task/proposal. Neither case may rewrite the canonical document automatically, except for explicitly marked generated sections such as `<!-- AHO:generated -->` caches.

## 11. Future Code Boundaries

External-local and remote modes require explicit module boundaries:

```text
Project Registry
Project Marker
Memory Resolver
Memory Store
Harness IO
Change Manager
Run Artifact Store
Runtime Adapter
Context Projector
```

Adapters such as Codex, local command, and future write-mode agents must not hardcode repo-local Harness paths. They should ask the Memory Resolver for the durable memory location and receive a context projection.

The initial store implementations should be:

- `RepoLocalMemoryStore`
- `ExternalLocalMemoryStore`
- future `RemoteMemoryStore`

Cross-project knowledge is deferred. Future shared memory should use separate namespaces and must not be mixed into a single project's change history.
