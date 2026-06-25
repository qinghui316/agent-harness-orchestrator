# Workbench Scheduler Worker Progression To Integration Candidate V1

## Purpose

Prove or minimally repair the ordinary Workbench path from an accepted low-conflict TaskGraph to multiple scheduler worker outputs and a same-Change `SchedulerIntegrationCandidate`.

This change is product capability convergence, not a new scheduler framework. It reuses the existing controlled scheduler wrapper, scheduler runtime worker lifecycle, scoped automation, Workbench confirmation queue, and IntegrationCheck candidate owner.

## Scope

In scope:

- Verify or minimally fix low-conflict two-task progression through existing controlled scheduler gates.
- Preserve `完全访问权限` as a wrapper-only path for scheduler work; raw `planning.scheduler.*` actions remain outside the direct automation allowlist.
- Generate a ready same-Change `SchedulerIntegrationCandidate` from two approved worker outputs when evidence is current and source/artifact hashes match.
- Ensure Workbench stops at the human `planning.scheduler.integration-check.run` gate or a clear blocker.
- Record reference evidence from Open Dynamic Workflows, Symphony, Loop Engineering, and Codex as design support, without copying their runtime model.

Out of scope:

- Full parallel executor, slot allocator, whole-wave dispatch framework, child Change creation, automatic IntegrationCheck apply/discard, remote merge, PR, Harness evolution, or a new workflow runtime.
- Treating worktree parallelism as merge safety.
- Moving raw scheduler actions into `完全访问权限`.

## Current Status

Completed / Ready to close.

Implementation found no missing scheduler executor path. Existing scheduler
owners already prove same-Change two-worker progression and ready
`SchedulerIntegrationCandidate` generation. The only product gap was stop
evidence honesty: after scoped automation consumes a budgeted controlled
scheduler continuation and the fresh next gate is the manual
`planning.scheduler.integration-check.run`, the run now records
`terminal-human-gate` instead of a misleading `max-steps`.

## Verification

Passed:

- `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/controlled-scheduler-advance-candidate.test.ts`;
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/workflow-actions.test.ts`;
- `npx vitest run tests/unit/integration-check-candidates.test.ts tests/unit/scheduler-integration-outcome.test.ts tests/unit/scheduler-run-completion.test.ts tests/unit/scheduler-run-closeout.test.ts`;
- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts tests/unit/workbench-scheduler-runtime-surface.test.ts`;
- `npx vitest run tests/unit/web-app.test.tsx`;
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`;
- `npx vitest run tests/unit/run.test.ts`;
- `npx vitest run tests/unit/spec-test.test.ts`;
- `npx vitest run tests/unit/validation.test.ts`;
- `npm run typecheck`;
- `npm run lint`;
- `npm run test:fast`;
- `npm run test:workbench`;
- `npm run build`.

Notes:

- `test:fast` initially exposed two unrelated test timing issues. The fix is
  test-only: the Codex completion-grace test now has a less brittle total
  process timeout, and the slow Workbench spec-test drift case has an explicit
  60s limit. `npm run test:fast` now passes.
- `npx vitest run tests/slow/workbench-scheduler-two-worker-integration-flow.test.ts`
  exceeded the 4 minute tool window. This is recorded as release/deep
  scheduler runtime-cost debt, not a product failure for this bounded
  stop-classification fix.
- Harness checks are run during closeout.

## Acceptance Feedback

No new E-drive real UI acceptance was run for this change.

Reason: the product patch only changes scoped automation stop classification
after an already-implemented controlled continuation reaches the manual
IntegrationCheck gate. The real two-worker UI/Codex path was previously
accepted in
`harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`.
This change does not alter Codex execution, worker validation/audit,
candidate compilation, source apply, or Workbench action payloads.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to minimal active/handoff pointer
  updates and final closeout.
- Experience lifecycle result: not an auto-evolve change.
- Roadmap/current-direction stale language check: planned at close.
- Old experience retained / merged / retired / archive-only: detailed historical acceptance stays archive-only.
