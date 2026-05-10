# Phase 1 CLI

## Purpose

Implement the first product code for Agent Harness Orchestrator: a TypeScript CLI named `aho` that registers local projects and manages repo-local Harness state.

## Scope

In scope:

- Single-package TypeScript/npm project.
- `aho project add/list/status`.
- `aho harness audit/init/reindex`.
- User-level flat-file registry at `~/.agent-harness/registry.json`.
- Project opt-in marker at `.agent-harness/project.json`, written only by `harness init`.
- Bundled Core Harness templates under `templates/core-harness/`.
- Unit and integration tests.

Out of scope:

- Codex `exec`.
- Claude Code integration.
- Worktree management.
- Web UI.
- SQLite.

## Current Status

Active.

## Verification

Pending final run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- Harness PowerShell checks
