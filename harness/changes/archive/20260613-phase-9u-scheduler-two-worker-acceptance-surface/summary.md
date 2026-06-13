# Phase 9U Scheduler Two Worker Acceptance Surface

## Purpose

Phase 9U verifies and tightens the scheduler surface after the first worker path: one additional scheduler worker can be started, reconciled, validated, audited, folded into a refreshed `SchedulerIntegrationCandidate`, and handed to the existing IntegrationCheck path with exactly the ready worktree targets.

This is an acceptance and boundary hardening phase. It does not add a scheduler loop, whole-wave dispatch, slot allocator, new Workbench action, HTTP route, CLI command, apply path, merge path, child Change behavior, or full parallel executor.

## Scope

In scope:

- Repair residual user-facing copy that still describes compatibility worker actions as `first worker` after `start-next`; ordinary transcript labels should describe the current worker path.
- Add focused acceptance coverage for the two-worker happy path: first approved worker output, start-next, current worker result reconcile, validation, audit, candidate refresh to two ready targets, and scheduler IntegrationCheck handoff.
- Keep scheduler decisions owned by `src/scheduler-runtime/*`; Workbench remains a projection/action-dispatch surface.
- Update docs to record Phase 9T archived and Phase 9U active.

Out of scope:

- No new Workbench action, HTTP route, CLI command, runtime artifact type, scheduler loop, slot allocator, whole-wave dispatch, or full parallel executor.
- No apply/discard, landing, PR, merge, child Change, or source-root mutation behavior.
- No broad Workbench or frontend refactor beyond copy/test fixes needed for current-worker acceptance.

## Current Status

Ready to close.

## Verification

- `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker"`: passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`: passed.
- `npm run test -- tests/unit/workflow-actions.test.ts`: passed.
- `npm run test -- tests/unit/workbench-server.test.ts`: passed.
- `npm run test -- tests/unit/scheduler-integration-outcome.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test`: passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: persistent user goal authorizes subagent self-review before execution; both subagent reviews are recorded in `reviews/review.md`.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
