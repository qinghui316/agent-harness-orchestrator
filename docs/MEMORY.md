# Memory Architecture

AHO separates durable project memory from agent execution. Agents can be restarted, replaced, or run through different adapters. Project memory must remain available through AHO-managed files and artifacts.

This document defines the target memory model. Some parts are already implemented through repo-local Harness files and run artifacts. `external-local` and `remote` memory stores are target architecture and are not implemented yet.

## 1. Why Separate Memory From Execution

Codex, Claude Code, local shell commands, and future runtimes are executors. They may have their own sessions or caches, but AHO must not rely on them as project truth.

AHO keeps durable memory in explicit stores so every run can rebuild context from artifacts:

```text
Project marker -> Memory Resolver -> Durable Memory -> Context Projection -> Executor
```

Agent output becomes durable only after it is written back as files, events, logs, diffs, validation reports, reviews, or archived change evidence.

## 2. Memory Modes

AHO supports three memory modes at the architecture level.

| Mode | Source of truth | Intended use | Status |
| --- | --- | --- | --- |
| `repo-local` | Files inside the target repository | Compatibility, portable/offline export, current implementation | Implemented today |
| `external-local` | AHO home on the user's machine | Personal multi-project default | Target default |
| `remote` | Remote memory service | Team, cross-device, shared audit history | Future |

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

## 10. Future Code Boundaries

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
