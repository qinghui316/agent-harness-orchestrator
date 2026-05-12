# Product Requirements

## 1. Product Positioning

Agent Harness Orchestrator is a local-first, personal-first, Spec-Anchored managed-run harness for AI coding.

It manages requirements, specs, plans, coding runs, validation, review, and Harness evolution across local code projects. Its core purpose is to prevent drift between human intent, specs, acceptance criteria, tests, code, validation results, and project rules.

AHO is not a generic multi-agent scheduler. Multi-agent orchestration is an execution mechanism. The product kernel is durable project memory plus Spec-Anchored execution.

It borrows orchestration ideas from Agent Orchestrator, Codex-oriented workflows from oh-my-codex, managed-agent resource boundaries from Anthropic's public managed-agents direction, and ECL/Harness protocol rules from ecl-harness-engineer.

## 2. Problems

- Requirements often go straight into coding without `spec.md`, `plan.md`, or `tasks.md`.
- Project rules and decisions stay in chat instead of the repository.
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
| Harness | Repo-local AI collaboration protocol, durable memory, and state |
| Change | The core workflow unit, represented by ECL artifacts |
| Spec | The semantic anchor for a change or feature area |
| Acceptance Criteria | The validation anchor that should map to tests or checks |
| Evolution | Controlled improvement of project Harness from archived evidence |
| Run | A workflow execution attempt, eventually isolated in a worktree |
| Artifact | Durable evidence such as events, logs, diffs, validation reports, and reviews |

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

Later phases add:

- Spec-Anchored local managed runs.
- Codex-style disposable executor adapters.
- Run events, logs, diffs, validation reports, and review artifacts.
- Validation and audit loops.
- Worktree isolation.
- Spec-Test mapping and drift warnings.
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
- L3 Spec-as-Source as an immediate requirement.
- Default container sandboxing for the personal MVP.

## 8. Success Criteria

- A user can add a local project and initialize Harness.
- A structured change can move from spec to plan to code to validation in later phases.
- Acceptance Criteria can become addressable anchors for tasks, tests, and validation in later phases.
- Codex CLI or Claude Code can be invoked through local adapters in later phases.
- Pending evolution can be surfaced and handled with proposal, audit, validation, results, and mark-complete.
- Multiple projects can eventually be shown in a dashboard.
- Agent output is persisted as artifacts, not only chat.
- High-impact agent output is confirmed by a human before advancing critical state.
- Uninitialized projects are unaffected.
