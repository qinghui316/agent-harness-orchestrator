# Spec: Phase 8B Scoped Change Proposal Boundary Split

## Goal

Make Change Proposal runs and acceptance safer under multiple active demands, then split the proposal implementation into maintainable domain modules without changing public behavior.

## Users

- AHO users working in Workbench with multiple active demand conversations.
- CLI users running `aho change spec/plan propose|accept`.
- Future agents modifying proposal/planning behavior.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8A closed and Phase 8B active, with no stale Phase 8A active/current claims.
- AC-002: Workbench proposal actions bind the selected demand `changeId` into proposal runs.
- AC-003: Proposal context, active files, and target hashes are read from the resolved selected Change, not a project-global exactly-one-active helper.
- AC-004: CLI proposal behavior remains compatible: single active works; multiple active Changes fail closed unless a scoped caller supplies `changeId`.
- AC-005: `acceptPlanProposal()` validates `spec.md`, `plan.md`, and `tasks.md` target hashes before writing canonical files.
- AC-006: `src/change/proposals.ts` becomes a compatibility facade, not the main implementation file.
- AC-007: Proposal schemas, paths/hashes, repository, parser/renderer, prompt builders, runner, and acceptance logic have owned modules.
- AC-008: Proposal artifact paths, JSON shape, run events, CLI output, Workbench approval behavior, and decision/audit scope remain compatible.
- AC-009: Proposal accept fails closed for stale spec/plan/tasks hash, missing AC, missing task, or AC-map blocking issue.
- AC-010: Proposal artifacts remain candidates; only explicit accept writes canonical `spec.md`, `plan.md`, or `tasks.md`.
- AC-011: New `src/change/proposals/*` modules do not depend on the facade, CLI, server, Workbench UI, or web UI.
- AC-012: No runtime/action/route/CLI command/scheduler/parallel/multi-Change/ODWF JS runtime/cache replay is introduced.
- AC-013: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- Do not add new command-line flags for proposal scoping.
- Do not change proposal artifact formats or run event names.
- Do not migrate external imports away from `src/change/proposals.ts`.
- Do not address external-local Codex read-dir scope in this phase.

## Constraints

- Preserve existing CLI output and exit-code behavior.
- Preserve Workbench action ids and approval allowlist behavior.
- Use UTF-8-safe edits and keep unrelated `README.md` untracked.

## Risks

- Splitting runner/acceptance code can accidentally alter artifact paths or event ordering.
- Fixing scoped proposal behavior could expose tests relying on legacy exactly-one-active behavior.
- Plan acceptance stale guard must include `spec.md` without changing proposal JSON shape.
