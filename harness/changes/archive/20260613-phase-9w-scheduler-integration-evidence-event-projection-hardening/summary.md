# Phase 9W Scheduler Integration Evidence Event Projection Hardening

## Purpose

Phase 9W hardens the observability and replay boundary after the scheduler integration bridge. Phase 9P through 9V already return scheduler worker outputs to the existing IntegrationCheck and apply/discard chain; this change records scheduler-owned runtime events for integration candidate, IntegrationCheck handoff, and terminal outcome evidence so recovery/run-graph consumers can see the full bridge without inferring it only from standalone artifacts.

This is not a new executor and not a new apply path. IntegrationCheck, apply, discard, aggregate validation/audit, source-root mutation, landing, PR, merge, next-worker dispatch, whole-wave dispatch, scheduler loops, slot allocation, and child Change creation remain out of scope.

## Scope

In scope:

- Add scheduler-runtime event types for integration candidate compiled, IntegrationCheck handoff completed, and Integration outcome recorded.
- Append canonical SchedulerRun-scoped events when `SchedulerIntegrationCandidate`, `SchedulerIntegrationCheckHandoff`, or terminal `SchedulerIntegrationOutcome` evidence is written.
- Keep idempotent paths from writing duplicate events when existing evidence is returned.
- Add focused tests for event journal evidence and existing non-execution boundaries.
- Update docs and ECL artifacts for Phase 9W handoff.

Out of scope:

- No new Workbench action, HTTP route, CLI command, frontend control, executor, scheduler loop, slot allocator, apply/discard path, IntegrationCheck engine, landing/PR/merge behavior, child Change creation, ODWF runtime, or cache/replay.
- No change to existing scheduler artifact JSON/Markdown shape, IntegrationCheck shape, apply/discard semantics, Workbench confirmation queue shape, SSE shape, thread storage, or workflow truth.

## Current Status

Ready to close.

## Verification

- `npm run test -- tests/unit/scheduler-integration-outcome.test.ts` - passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker through current-worker gates"` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested long-running goal discipline: plan, ECL change, verification, close/git, subagent self-review, and modular owner-module code.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
