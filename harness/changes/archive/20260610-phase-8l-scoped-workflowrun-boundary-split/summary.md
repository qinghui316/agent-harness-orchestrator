# Phase 8L Scoped WorkflowRun Boundary Split

## Purpose

Repair the remaining WorkflowRun scope boundary and split
`src/workflow-run/manager.ts` into owned domain modules. WorkflowRun is runtime
coordination and recovery evidence; it must not accept misplaced, cross-Change,
or forged run/event state during projection, resume, reconcile, or event append.

This is a scoped bug fix plus refactor. It does not add runtime capability,
Workbench actions, CLI commands, HTTP routes, scheduler behavior, parallel
execution, automatic child Changes, ODWF JavaScript runtime, or cache/replay.

## Scope

In scope:

- Repair post-8K handoff drift in `AGENTS.md`, `docs/STATUS.md`,
  `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, and `docs/BOUNDARIES.md`.
- Add strict WorkflowRun `changeId` guards for read, event read, event append,
  queue binding, queue sync, and resume paths.
- Keep projection-safe listing behavior: invalid or misplaced WorkflowRun files
  are skipped by `listWorkflowRuns()` and `getLatestWorkflowRun()`.
- Split WorkflowRun schemas, paths, repository, events, guards, recovery key,
  proposal-start validation, lifecycle sync, stage resume, and summary helpers
  into owned `src/workflow-run/*` modules behind the manager facade.
- Preserve existing artifact paths, JSON shape, event journal shape, recovery
  semantics, Workbench projections, action payloads, and decision/audit scope.

Out of scope:

- Splitting `src/run/manager.ts` or `src/change/manager.ts`.
- Product runtime feature work, new Workbench actions, new routes, new CLI
  commands, scheduler/parallel execution, multi-Change auto creation, ODWF
  runtime, cache/replay, or source-root apply behavior changes.
- Editing unrelated `README.md`.

## Current Status

Completed. Implemented and verified; ready for user review / close.

## Verification

Passed:

- Drift stale check: `rg "Phase 8K is active|Current active phase: Phase 8K|harness/changes/active/phase-8k|Pending Harness evolution: .*pending.md" AGENTS.md docs`
- Drift target-language check: `rg "Phase 8L|WorkflowRun|recovery evidence|domain boundary|module boundary|scoped WorkflowRun" AGENTS.md docs harness/changes/active`
- `npm run typecheck`
- `npm run lint`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: combined focused test command timed out after
  124 seconds; the same focused test files passed when run individually.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
