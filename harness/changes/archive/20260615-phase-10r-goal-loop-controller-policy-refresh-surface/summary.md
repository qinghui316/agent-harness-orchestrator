# Phase 10R Goal Loop Controller Policy Refresh Surface

## Purpose

Phase 10R connects the Phase 10Q `GoalLoopControllerPolicy` contract to an explicit Workbench refresh surface. The current product code can compile and project controller policy evidence, but normal Workbench paths do not write that artifact, leaving the controller policy as a test-only contract.

This phase adds a scoped, non-executing refresh action for the current visible Harness gate. It records controller policy evidence from the latest Goal Loop packet plus the current concrete gate snapshot, then lets the read model display the verdict. It does not execute the recommended action or create a new primary gate.

## Scope

In scope:

- Fix post-10Q handoff drift and mark Phase 10R active.
- Add a scoped Workbench action for refreshing Goal Loop controller policy evidence.
- Attach that action only as a secondary action on a matching concrete Harness gate.
- Preserve controller policy ownership in `src/goal-loop`; Workbench supplies only the current gate snapshot and displays the latest verdict.
- Add action registry, stale-target revalidation, result wording, read-model, and module-boundary tests.

Out of scope:

- No autonomous Goal Loop runtime.
- No execution of `recommendedAction`.
- No new primary confirmation item, queue reordering, hidden continuation, scheduler loop, worker start, validation, audit, IntegrationCheck, apply, close, landing, PR, merge, child Change, or source mutation.
- No read-model writes; projection remains read-only.
- No CLI command, HTTP route, frontend page, lazy projection, ODWF runtime, cache/replay, or workflow-truth change.

## Current Status

Ready to close.

## Verification

- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/goal-loop-decision.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/unit/workbench.test.ts -t "goal loop"`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
