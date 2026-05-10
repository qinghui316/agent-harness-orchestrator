# {{PROJECT_NAME}} Agent Guide

{{PROJECT_NAME}} is managed by Agent Harness Orchestrator.

## Context Loading

1. Read this `AGENTS.md`.
2. Read `docs/ECL.md`.
3. If `harness/changes/active/` contains a change, read its change files.
4. If no active change exists and `harness/evolution/pending.md` exists, read it before `docs/STATUS.md`.
5. Read `docs/STATUS.md`.

## Work Rules

- Keep `AGENTS.md` as a map, not a manual.
- Use active change files for structured work.
- Do not create a second active change.
- Do not hand-edit `harness/changes/INDEX.json`; regenerate it.
- Preserve user changes.

## Verification

Run project-specific checks documented in `docs/STATUS.md` and task-specific docs.
