# Controlled Scheduler Continuation Guard

## Purpose

Advance the controlled Scheduler loop boundary from read-only continuation readiness into an execution-preflight guard for the existing `planning.scheduler.controlled-advance.run` wrapper. After a controlled Scheduler step records a next-candidate readiness summary, the next controlled advance must consume that evidence and prove the submitted concrete scheduler gate still matches the recorded post-step preflight scope before any fresh Goal Loop evidence or concrete scheduler transition is started.

This is a product-functional safety slice toward the smallest controlled Scheduler loop runtime boundary. It still executes at most one human-confirmed Scheduler transition and does not add a hidden loop, new action, whole-wave dispatch, slot allocator, source apply/merge/close, remote landing, child Changes, ToolPolicy changes, or Harness evolution automation.

## Scope

In scope:

- Add a controlled continuation guard for `planning.scheduler.controlled-advance.run`.
- Treat only a complete absence of prior controlled-step evidence in the current Change/SchedulerRun lineage as bootstrap.
- Fail closed when prior controlled-step evidence exists but has warnings, lacks continuation readiness, is not `ready-for-human-gate`, or no longer matches the submitted concrete scheduler gate.
- Compare the submitted concrete gate against the prior post-step `GoalLoopGateReadinessPreflight.currentGate` scope, using existing required-target validation and strict scope matching.
- Preserve the existing Workbench controlled-advance action and human confirmation path.
- Add targeted unit coverage for bootstrap, matching continuation, stale/mismatched continuation, missing targets, scope transition, and handler fail-before-execution behavior.

Out of scope:

- New Workbench actions, buttons, server routes, or frontend behavior.
- Automatic Scheduler loops, repeated continuation, whole-wave dispatch, slot allocation, or parallel executor behavior.
- Source apply, merge, close/archive, remote landing, child Change creation, or Harness evolution automation.
- ToolPolicyGate or human gate changes.
- Broad scheduler, Goal Loop, Workbench, or maintenance refactors.

## Current Status

Ready to close. The continuation guard is implemented, targeted and product verification passed, the independent close-ready review finding was fixed, and handoff docs are aligned for archive.

## Verification

Passed:

- `npx vitest run tests/unit/controlled-scheduler-step-contract.test.ts tests/unit/controlled-scheduler-advance-post-step.test.ts` (17 tests).
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast` (39 files, 409 tests).
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Notes:

- An initial `npm run test:fast` run had one transient Workbench DOM lookup failure in `tests/unit/web-app.test.tsx`; the failed test passed standalone, and a second full `test:fast` run passed.
- No targeted Workbench/read-model or App DOM update was needed because the change does not alter user-visible projection or UI copy.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: plan review used subagents `019ee69c-f76e-7a03-a67c-c3f81ef00ccf`, `019ee69d-5195-7981-9a5d-0d8f1c7e6c37`, and `019ee69d-8328-73e1-bd68-186c1fc7ceb0`.
- Retries or environment failures: one transient `test:fast` Workbench DOM lookup failure passed on standalone rerun and on the next full `test:fast` run.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: handoff docs will receive only active/current archive pointer updates.
- Experience lifecycle result: not applicable; no pending Harness evolution exists.
- Roadmap/current-direction stale language check: required before close for `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
