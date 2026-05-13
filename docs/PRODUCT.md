# Product Requirements

## 1. Product Positioning

Agent Harness Orchestrator is a local-first, personal-first, Spec-Anchored managed-run harness for AI coding.

It manages requirements, specs, plans, coding runs, validation, review, and Harness evolution across local code projects. Its core purpose is to prevent drift between human intent, specs, acceptance criteria, tests, code, validation results, and project rules.

AHO is not a generic multi-agent scheduler. Multi-agent orchestration is an execution mechanism. The product kernel is project-linked durable memory plus Spec-Anchored execution.

It borrows orchestration ideas from Agent Orchestrator, Codex-oriented workflows from oh-my-codex, managed-agent resource boundaries from Anthropic's public managed-agents direction, and ECL/Harness protocol rules from ecl-harness-engineer.

## 2. Problems

- Requirements often go straight into coding without `spec.md`, `plan.md`, or `tasks.md`.
- Project rules and decisions stay in chat instead of durable AHO-managed memory.
- New agents need repeated explanations of project constraints.
- Test failures and user corrections do not become rules, tests, or docs.
- Specs, tests, code, and validation results can drift without an explicit anchoring mechanism.
- Agent-internal memory and chat sessions are not reliable project memory.
- Multi-project state is invisible.
- Single skills cannot reliably manage multiple projects, worktrees, logs, and run state.
- Harness evolution needs an external orchestrator and human-controlled gates.

## 3. Target Users

Personal developers manage several local projects with Codex CLI or Claude Code and want AI to clarify requirements before coding.

Small teams want traceable, reviewable, verifiable AI coding workflows where project rules evolve from evidence.

## 4. Core Concepts

| Concept | Meaning |
| --- | --- |
| Project | An explicitly added local repository |
| Harness | Project-linked AI collaboration protocol, durable memory, and state |
| Change | The core workflow unit, represented by ECL artifacts |
| Spec | The semantic anchor for a change or feature area |
| Acceptance Criteria | The validation anchor that should map to tests or checks |
| Evolution | Controlled improvement of project Harness from archived evidence |
| Run | A workflow execution attempt, eventually isolated in a worktree |
| Artifact | Durable evidence such as events, logs, diffs, validation reports, and reviews |
| Memory Mode | Where durable project memory lives: repo-local, external-local, or future remote |

## 5. Product Principles

1. Local-first.
2. Explicit opt-in.
3. Change-driven.
4. Spec-Anchored development.
5. Shared artifacts over shared chat.
6. Project memory over agent-internal memory.
7. Worktree isolation.
8. Controlled evolution.
9. Human confirmation at high-impact gates.

## 6. MVP Direction

Phase 0 creates this repository's Harness skeleton.

Phase 1 creates a TypeScript CLI for:

- Adding local projects.
- Listing managed projects.
- Auditing Harness state.
- Initializing or updating Harness files.
- Reading active change, pending evolution, git branch, dirty state, and recent runs.

Phase 2A adds Node-native structured change management:

- Creating active ECL changes.
- Reporting active change status.
- Parsing Acceptance Criteria IDs.
- Mapping tasks to Acceptance Criteria.
- Generating `ac-map.json`.
- Closing changes through a lightweight close gate.

Phase 2B adds local command run artifacts:

- Starting one local command run against an active change.
- Writing `run.json`, `context.md`, `events.jsonl`, `stdout.log`, and `stderr.log`.
- Listing and showing recorded runs.
- Preserving execution evidence without treating it as human approval.

Phase 2C adds Codex read-only proposal capture:

- Reusing the user's local Codex CLI configuration.
- Generating `context.md` and `prompt.md`.
- Capturing Codex stdout/stderr, JSONL events, and final proposal text.
- Treating Codex output as proposal-only evidence.

Phase 2D adds memory resolver foundation:

- Centralizing repo-local Harness/change/run roots behind a resolver.
- Writing `memoryMode: "repo-local"` into new project markers.
- Keeping old markers compatible as repo-local.
- Adding `aho memory status` as a diagnostic command.
- Keeping external-local and remote behind explicit resolver boundaries before enabling them.

Phase 2E adds external-local memory as an opt-in mode:

- `aho harness init --memory external-local`.
- Target repositories keep only `AGENTS.md`, `.agent-harness/project.json`, and `.agent-harness/.gitignore`.
- Durable docs, Harness files, scripts, changes, and run artifacts live under AHO home.
- `change`, `run start`, and `run codex` work against the external memory root.

Later phases add:

- Phase 3A: AHO-owned worktree isolation.
- Phase 3B: change-scoped validation gate.
- Phase 3C: Auditor gate.
- Phase 3D: Codex write-mode adapters behind explicit worktree boundaries.
- Switching external-local to the personal default after more migration and sync work.
- Run events, logs, diffs, validation reports, and review artifacts.
- Spec-Test mapping and drift warnings.
- Local dashboard.
- Interactive terminal sessions.

Long-term memory direction:

- `repo-local` remains the current implementation and compatibility/migration mode.
- `external-local` is the personal multi-project default target: business repos keep a marker and AGENTS memory map, while durable memory lives in AHO home.
- `remote` is the future team and cross-device mode: remote memory is authoritative and local memory is a cache.
- Cross-project knowledge memory is deferred and must use a separate namespace from single-project change history.

## 7. Non-Goals For MVP

- Cloud sync.
- Multi-user permissions.
- Remote memory gateway/server.
- Cross-project knowledge store.
- Automatic merge to main.
- Unattended Harness mutation.
- In-product model API runtime.
- Automatic takeover of every project.
- GitHub issue integration.
- L3 Spec-as-Source as an immediate requirement.
- Default container sandboxing for the personal MVP.

## 8. Success Criteria

- A user can add a local project and initialize Harness.
- A structured change can move from spec to plan to code to validation in later phases.
- Acceptance Criteria can become addressable anchors for tasks, tests, and validation in later phases.
- Codex CLI can be invoked through a read-only proposal adapter.
- Pending evolution can be surfaced and handled with proposal, audit, validation, results, and mark-complete.
- Multiple projects can eventually be shown in a dashboard.
- Agent output is persisted as artifacts, not only chat.
- High-impact agent output is confirmed by a human before advancing critical state.
- Uninitialized projects are unaffected.
