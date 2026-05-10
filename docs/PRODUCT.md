# Product Requirements

## 1. Product Positioning

Agent Harness Orchestrator is a local-first, change-driven AI coding orchestrator with repo-local Harness and controlled evolution.

It manages requirements, plans, coding runs, validation, review, and Harness evolution across local code projects. It borrows orchestration ideas from Agent Orchestrator, Codex-oriented workflows from oh-my-codex, and ECL/Harness protocol rules from ecl-harness-engineer.

## 2. Problems

- Requirements often go straight into coding without `spec.md`, `plan.md`, or `tasks.md`.
- Project rules and decisions stay in chat instead of the repository.
- New agents need repeated explanations of project constraints.
- Test failures and user corrections do not become rules, tests, or docs.
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
| Harness | Repo-local AI collaboration protocol and state |
| Change | The core work unit, represented by ECL artifacts |
| Evolution | Controlled improvement of project Harness from archived evidence |
| Run | A workflow execution, eventually isolated in a worktree |

## 5. Product Principles

1. Local-first.
2. Explicit opt-in.
3. Change-driven.
4. Spec before code.
5. Shared artifacts over shared chat.
6. Worktree isolation.
7. Controlled evolution.
8. Human approval at high-impact gates.

## 6. MVP Direction

Phase 0 creates this repository's Harness skeleton.

Phase 1 creates a TypeScript CLI for:

- Adding local projects.
- Listing managed projects.
- Auditing Harness state.
- Initializing or updating Harness files.
- Reading active change, pending evolution, git branch, dirty state, and recent runs.

Later phases add:

- Codex `exec` task runs.
- Validation and audit loops.
- Local dashboard.
- Interactive terminal sessions.

## 7. Non-Goals For MVP

- Cloud sync.
- Multi-user permissions.
- Automatic merge to main.
- Unattended Harness mutation.
- In-product model API runtime.
- Automatic takeover of every project.
- GitHub issue integration.

## 8. Success Criteria

- A user can add a local project and initialize Harness.
- A structured change can move from spec to plan to code to validation in later phases.
- Codex CLI or Claude Code can be invoked through local adapters in later phases.
- Pending evolution can be surfaced and handled with proposal, audit, validation, results, and mark-complete.
- Multiple projects can eventually be shown in a dashboard.
- Agent output is persisted as artifacts, not only chat.
- Uninitialized projects are unaffected.
