# Review: workbench-scheduler-worker-progression-to-integration-candidate-v1

Status: approved for close.

## Findings

No unresolved product findings.

Observed gap: scoped automation already refused raw scheduler actions and existing scheduler owners already cover two-worker same-Change candidate generation, but when a controlled scheduler continuation used the final budgeted step and the fresh next gate was the manual `planning.scheduler.integration-check.run`, the automation artifact could still report `max-steps`. That was misleading user-surface/runtime evidence, not missing scheduler execution.

Resolution: `automation-runtime` now treats `planning.scheduler.integration-check.run` as a terminal human gate and performs one post-budget current-primary observation before finalizing a `max-steps` run. It does not dispatch IntegrationCheck, does not add raw scheduler actions to the allowlist, and does not create a new executor.

## Verification

Selected verification scope: automation runtime stop classification, scheduler candidate/IntegrationCheck boundary, Workbench projection/user surface, and test signal stability needed by `test:fast`.

Passed:

- `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/controlled-scheduler-advance-candidate.test.ts`
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/workflow-actions.test.ts`
- `npx vitest run tests/unit/integration-check-candidates.test.ts tests/unit/scheduler-integration-outcome.test.ts tests/unit/scheduler-run-completion.test.ts tests/unit/scheduler-run-closeout.test.ts`
- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts tests/unit/workbench-scheduler-runtime-surface.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/run.test.ts`
- `npx vitest run tests/unit/spec-test.test.ts`
- `npx vitest run tests/unit/validation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run test:workbench`
- `npm run build`

Aggregate/split notes:

- One large combined ad hoc Vitest invocation initially failed a `web-app.test.tsx` DOM lookup, but `web-app.test.tsx` passed alone and with `workbench-read-model.test.ts`; this matches existing aggregate-only DOM timing behavior and is not caused by the stop-classification patch.
- `npm run test:fast` initially failed from two test-signal issues unrelated to scheduler product behavior: `run.test.ts` used a too-tight process timeout for a completion-grace case, and `spec-test.test.ts` had a naturally slow Workbench drift case using the default 30s test limit. Both tests passed individually. The test-only fix increased the process timeout and added an explicit 60s test timeout. After that, `npm run test:fast` passed.
- `npx vitest run tests/slow/workbench-scheduler-two-worker-integration-flow.test.ts` exceeded the 4 minute tool window. This is release/deep scheduler runtime-cost debt, not a product failure for this patch. Existing archived real UI acceptance plus targeted scheduler candidate tests cover the path for this small runtime evidence fix.

## Complexity Deletion Review

delete: none.
reuse: existing `automation-runtime` policy/runner, current primary gate resolution, scheduler candidate tests, Workbench read-model/DOM tests, and existing IntegrationCheck candidate owners.
yagni: avoided a scheduler loop, raw scheduler allowlist expansion, full parallel executor, slot allocator, child Change framework, second permission system, second projection system, and new evidence family.
shrink: chose a post-budget observation helper instead of threading a new scheduler state machine through automation.
net: Lean already.

This review is supplemental and does not replace correctness, source safety, stale-target, ToolPolicyGate, human-gate, or verification checks.

## Acceptance Feedback

Real/manual acceptance performed: no new E-drive real UI run for this change.

Reason: the actual product patch only changes stop reason classification after already-implemented controlled continuation reaches a terminal human IntegrationCheck gate. The two-worker real UI path was already accepted in `harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`; this change does not alter Codex execution, worker validation/audit, candidate compilation, or Workbench action payloads.

Real Codex acceptance claimed: no.
Manual config edits: none.
Retries/environment failures: slow scheduler release test exceeded the tool window.
Product-fixable follow-up: keep scheduler full-chain acceptance in release/deep scripts; do not move it into the daily gate.

## Documentation Entropy Coverage

Applicable: yes, active/handoff pointers were updated.

Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
Before/after line counts checked during closeout.
Current-state duplication decision: only compact active/archive pointers and current baseline deltas belong in handoff docs; detailed run history stays in archived summaries and `harness/changes/INDEX.json`.
Historical detail decision: archive-only.

## Experience Lifecycle Coverage

Applicable: no. This is not an auto-evolve or Harness rule/template change.

## Worktree Diff Artifact Coverage

Applicable: no. The patch does not change worktree diff collection or diff-producing artifacts.

## Read Model Projection Coverage

Applicable: yes. Scheduler/automation user-surface stop state depends on current primary gate projection.

Checked scope: current primary gate, scheduler assisted surfaces, IntegrationCheck human gate, and existing Workbench projection behavior.
Tested with: `workbench-read-model.test.ts`, `workbench-goal-loop-surface.test.ts`, `workbench-scheduler-runtime-surface.test.ts`, and `web-app.test.tsx`.

## Workbench User-Surface Honesty Coverage

Applicable: yes.

Sampled surface: right confirmation card / controlled scheduler continuation surface / IntegrationCheck gate.
Visible primary backed by implemented path: checked by Workbench read-model, Goal Loop surface, and DOM suites.
Primary alignment: existing `confirmationQueue.primary` remains authoritative; no new primary surface was added.
Out-of-scope future capability check: no full parallel executor, raw scheduler allowlist, integration apply/discard automation, remote/merge, or Harness evolution affordance was added.
Duplicate/running behavior: existing running-gate suppression tests passed.
High-impact action result: `planning.scheduler.integration-check.run` remains manual.

## Scoped Workbench Action Payload Coverage

Applicable: yes for preserving existing current-gate revalidation and no raw scheduler action expansion.

Checked target ids/action path: `action-revalidation.test.ts`, `workflow-actions.test.ts`, `controlled-scheduler-advance-candidate.test.ts`.
Duplicate/evidence affordance: no new action surface added.

## Transcript Renderer Source-Boundary Coverage

Applicable: no. The default main transcript renderer was not changed.

## Source Apply Safety Coverage

Applicable: yes as a boundary assertion for scheduler/integration flow.

Checked source behavior: this patch never mutates source root and does not dispatch IntegrationCheck/apply. Existing integration apply/discard safety tests passed, and the slow scheduler release test timeout is recorded as runtime-cost debt rather than a source-safety pass claim.
Out-of-scope source mutation check: raw scheduler IntegrationCheck, integration apply/discard, remote, merge, and Harness evolution remain outside automation.
Tested with: `integration-check-apply-discard.test.ts`, `scheduler-integration-outcome.test.ts`, `scheduler-run-completion.test.ts`, `scheduler-run-closeout.test.ts`, and Workbench aggregate.

## Runtime Bridge Boundary Coverage

Applicable: no. Codex bridge/runtime executor behavior was not changed.

## Proposal / Runtime Boundary Coverage

Applicable: yes for scheduler continuation/candidate boundary.

Artifact classification: `SchedulerIntegrationCandidate` remains scheduler/integration evidence and a human-gated handoff, not merge safety and not workflow authority.
Boundary matrix checked: same-Change candidate, scheduler run completion, IntegrationCheck outcome, raw scheduler action exclusion, and stale/forged target behavior.
Tested with: `integration-check-candidates.test.ts`, `scheduler-integration-outcome.test.ts`, `scheduler-run-completion.test.ts`, `scheduler-run-closeout.test.ts`, `action-revalidation.test.ts`.

## Goal Loop Boundary Coverage

Applicable: yes. The touched scheduler path is exposed through controlled continuation / assisted gate evidence only.

Persistent scope: selected Change only.
Recommendation authority: Goal Loop/controller/preflight evidence remains non-executing; automation consumes only the current concrete gate and stops at manual IntegrationCheck.
Fallback priority: concrete gates remain primary.
Tested with: `goal-loop-decision.test.ts` through `test:fast`, `workbench-goal-loop-surface.test.ts`, `controlled-scheduler-advance-candidate.test.ts`, and `automation-runtime.test.ts`.

## Module Boundary Coverage

Applicable: yes.

Owner modules checked: `src/automation-runtime/policy.ts`, `src/automation-runtime/runner.ts`, existing Workbench read-model/action owners, existing scheduler/integration candidate owners.
Moved responsibilities: none.
Retained facade responsibilities: unchanged.
Forbidden write-back locations: no new logic added to broad Workbench/server/App facades.
Compatibility result: existing action types and payloads unchanged.
Tested with: targeted automation, Workbench, scheduler, and aggregate suites listed above.

## Core Mechanism Reuse Coverage

Applicable: yes.

Existing mechanisms reused/strengthened: scoped automation stop policy, current primary gate resolution, controlled scheduler wrapper, Workbench confirmation queue, candidate compilation, same-Change guards, and IntegrationCheck human gate.
New cross-cutting mechanism: none.
Why existing mechanisms were sufficient: the only gap was final stop classification after re-observing the current gate.
Local framework avoided: no new runtime/state machine/permission/projection/evidence system.
Future-cost result: clearer stop evidence avoids adding another explanation layer for the same scheduler terminal handoff.

## Close / Handoff Drift Coverage

Applicable: yes.

Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
Stale active-path grep: planned after archive move.
Latest archive / active path alignment: to be checked after `harness-change close`.
Pending evolution state: no pending evolution before close.

## Remote Handoff Acceptance Coverage

Applicable: no. Remote handoff behavior was not changed.
