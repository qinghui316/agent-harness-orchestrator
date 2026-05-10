# Spec: Phase 1 CLI

## Goal

Create a usable CLI foundation that can explicitly register local projects and initialize or inspect their Core Harness files.

## Users

- Personal developers managing several local repositories.
- Future agents using local project artifacts instead of chat-only context.

## Acceptance Criteria

- `aho project add <path>` writes only the user registry and does not modify the target project.
- `aho project list` shows registered projects and basic readiness.
- `aho project status <name-or-path>` reports registry, Git, active change, and pending evolution state.
- `aho harness audit <name-or-path>` is read-only and supports unregistered paths.
- `aho harness init <name-or-path>` requires a registered project and writes the project marker plus missing Core Harness files.
- `aho harness init` aborts when an active change already exists in the target project.
- `aho harness reindex <name-or-path>` rebuilds `harness/changes/INDEX.json` with Node-native logic.
- `--json` is available for list/status/audit/init/reindex outputs.

## Non-Goals

- No runtime agent execution.
- No worktree management.
- No dashboard.
- No SQLite.
- No cloud sync.

## Constraints

- Node.js 20+.
- ESM TypeScript package.
- npm package manager.
- Flat files are the source of truth.
- Templates must be bundled under `templates/core-harness/` and copied to `dist/templates/` during build.

## Risks

- Generating Harness files must avoid overwriting user content.
- Registry paths must be stable across Windows path casing and separators.
- CLI should not depend on PowerShell scripts inside target projects.
