# Workbench SchedulerRun Prepared Target Helper Reuse

## Purpose

Reuse the existing Workbench action target revalidation owner for repeated
SchedulerRun prepared-target checks in `src/workbench/actions/boundary.ts`.
This keeps cross-cutting stale-target / prepared-state checks in one pure helper
instead of letting each Workbench action branch grow its own local gate.

## Scope

In scope:

- Add a pure prepared-target assertion to `src/workbench/actions/active-target.ts`.
- Replace only SchedulerRun checks whose current semantics are exactly
  `id === request.schedulerRunId`, `changeId === changeId`, and
  `status === "prepared"` with the new helper.
- Preserve existing latest-target checks through `assertLatestWorkbenchActionTarget`.
- Add targeted boundary tests for the new helper and owner-module constraints.

Out of scope:

- `planning.scheduler.plan.prepare`, because its stale-target error wording is
  distinct and it does not use the same stale/not-prepared message.
- `planning.scheduler.run.complete`, because it accepts `prepared` or
  `completed` SchedulerRuns.
- Scheduler runtime lineage, reservations, worker result, rework, validation,
  audit, integration, ToolPolicyGate, human-gate, UI, server, or Goal Loop
  behavior changes.
- Public action ids, payload schemas, manager facades, and Workbench projections.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` - passed; 3 files, 49 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm run test:fast` - passed; 29 files, 339 tests.
- `npm run test:integration` - passed; 1 file, 38 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan self-review by subagent
  `019ede37-33d4-7983-8a37-011ba1440829` returned PASS and required the
  `planning.scheduler.plan.prepare` and `planning.scheduler.run.complete`
  exclusions recorded above.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
