# Spec: Bootstrap ECL Harness

## Goal

Create a complete ECL Core Harness skeleton for Agent Harness Orchestrator so later development can proceed through repository artifacts instead of chat-only decisions.

## Users

- Project maintainers using AI coding agents.
- Future agents entering this repository.

## Acceptance Criteria

- The repository is a Git repository.
- Three reference projects are included as submodules.
- `AGENTS.md` is a concise map and links to detailed docs.
- `docs/ECL.md` defines Small Change, Structured Change, plan-first handling, active change lifecycle, and pending evolution.
- `docs/STATUS.md` points to this active change.
- Active change files exist and are complete.
- Harness scripts support lifecycle, lint, encoding scan, and evolution checks.
- CI runs Harness checks only.

## Non-Goals

- No TypeScript CLI implementation.
- No Web UI.
- No model API or runtime adapter implementation.
- No product build/test commands.

## Constraints

- PowerShell scripts must be compatible with Windows PowerShell 5.1.
- PowerShell file reads/writes must use UTF-8.
- `harness/changes/INDEX.json` is generated, not hand-maintained.
- Reference source is submodule-based, not vendor-copied.

## Risks

- Reference submodules can increase clone complexity.
- Minimal PowerShell scripts may later need replacement with TypeScript implementations.
- No product tests exist until Phase 1.
