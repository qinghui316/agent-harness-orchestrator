# Review: workbench-integrationfix-real-ui-acceptance-v1

Status: completed; ready to close.

## Findings

No unresolved blocking findings remain.

Fixed findings:

1. Product path blocker: Codex proposed plans with two scoped tasks were not
   reliably converted into scheduler-ready DecompositionPlan tasks. Fixed in
   `src/workbench/planning/builders.ts` by reusing the existing planning builder
   owner to derive scoped tasks from `proposedPlanMd` and ignore negated source
   mentions.
2. Stale target blocker: Goal Loop controller refresh / gate-readiness actions
   could omit current scheduler target ids. Fixed in the existing confirmation
   projection owner by merging fresh `nextAction` scope into assisted Goal Loop
   actions.
3. Human-gate boundary blocker: controlled continuation could auto-consume
   `planning.scheduler.integration-check.run`. Fixed in
   `src/workbench/actions/visible-goal-loop-current-gate.ts` so IntegrationCheck
   is treated as a manual scheduler barrier and the runtime stops before
   dispatch.

## Verification

- `npx vitest run tests/unit/visible-goal-loop-current-gate.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/goal-loop-runtime.test.ts` passed.
- `npx vitest run tests/unit/integration-aggregate-validation.test.ts tests/unit/integration-fix-attempts.test.ts tests/unit/workbench-planning-scheduler-prep.test.ts` passed.
- `npx vitest run tests/unit/workbench-scheduler-runtime-surface.test.ts tests/unit/automation-runtime.test.ts tests/unit/controlled-scheduler-advance-candidate.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run test:workbench` passed.
- `npm run build` passed.

Selected verification scope: real Workbench UI acceptance plus targeted owner
suites for IntegrationCheck aggregate validation, IntegrationFix, planning
scope extraction, Goal Loop assisted gate scope, automation policy, controlled
continuation, and Workbench Goal Loop surface. Full `test:workbench` was not
rerun because the touched contracts are covered by targeted Workbench/domain
suites, `test:fast`, and the daily Workbench aggregate.

## Real UI Acceptance

- Workbench URL: `http://127.0.0.1:4357/`.
- Source: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- Runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- Change id: `src-alpha-ts-alphamode-legacy-modern`.
- Scheduler run: `scheduler-run-20260625164120-d30d54c9`.
- Worker worktrees: `wt-20260626-004211-968996`,
  `wt-20260626-005311-91f959`.
- Ready candidate: `scheduler-integration-candidate-e140c478`.
- IntegrationCheck: `apply-check-20260625165935-fa41891a`.
- IntegrationFix attempt:
  `fix-apply-check-20260625165935-fa41891a-mqtqz4du`.
- IntegrationFix Codex run:
  `fix-apply-check-20260625165935-fa41891a-mqtqz4du-codex`
  (`runtime = coder-codex`, `executionMode = worktree`, `status = completed`,
  `exitCode = 0`).
- Repaired patch:
  `workbench/integration-checks/apply-check-20260625165935-fa41891a/repaired.patch`,
  hash `af26694518e45610614cae93c86fe7be30b64445576f95a1438aaed69fc1cd45`.
- Aggregate validation: `passed`.
- Aggregate audit: `approved`.
- Final UI gate: `integration-apply` with human approval actions
  `apply-check-apply:*` and `apply-check-discard:*`; no automatic integration
  apply/discard occurred.

## Complexity Deletion Review

- delete: none.
- reuse: existing planning builder, Goal Loop confirmation projection,
  visible current-gate resolver, IntegrationCheck, IntegrationFix, Codex
  runtime, validation/audit, source safety, and Workbench confirmation queue.
- yagni: avoided new workflow runtime, permission system, projection framework,
  scheduler executor, child Change framework, evidence family, and marker-only
  product acceptance.
- shrink: fixed shared owner paths instead of adding local UI/action guards.
- net: Lean already.

## Worktree Diff Artifact Coverage

Applicable. The real IntegrationFix run produced a new file in the integration
fix checkout, `src/integration-note.ts`, and recorded it in `diff.patch`,
`diff-stat.txt`, and `repaired.patch`. Source-root mutation still waited for
the human integration apply gate.

## Read Model Projection Coverage

Applicable. Browser/API snapshot after repair showed the selected Change with
`nextAction.actionType = planning.scheduler.integration-check.run` disabled as
post-check status, and the authoritative confirmation queue primary as
`integration-apply`. The primary human actions were apply, feedback, discard,
and evidence.

## Workbench User-Surface Honesty Coverage

Applicable. The visible final surface did not advertise automatic
IntegrationCheck apply/discard, remote, merge, PR, Harness evolution, full
parallel executor, or raw scheduler automation. Running controlled continuation
now stops at the manual IntegrationCheck barrier before dispatch, covered by
`visible-goal-loop-current-gate.test.ts`.

## Scoped Workbench Action Payload Coverage

Applicable. IntegrationCheck and integration apply/discard target ids remained
explicit: `applyCheckId`, `schedulerRunId`, `schedulerIntegrationCandidateId`,
`schedulerClaimReservationId`, `schedulerReconcileSnapshotId`, `worktreeIds`,
and `changeId` were present in the Workbench snapshot and IntegrationCheck
artifact. Controlled continuation now refuses to turn that manual gate into a
child `planning.scheduler.controlled-advance.run`.

## Source Apply Safety Coverage

Applicable. External source root:
`E:\aho-accept\integrationfix-real-ui-v1\src`. Runtime home:
`E:\aho-accept\integrationfix-real-ui-v1\home`. IntegrationFix wrote only the
integration fix checkout and AHO memory artifacts. Before any integration
apply/discard, `git -C E:\aho-accept\integrationfix-real-ui-v1\src status --short`
returned no output.

## Runtime Bridge Boundary Coverage

Applicable. Codex-backed repair is external executor evidence scoped to the
integration fix checkout. The durable authority remains IntegrationCheck,
aggregate validation/audit, repaired patch artifact, and human
apply/discard gates. Codex run ids and event logs do not authorize source-root
mutation.

## Proposal / Runtime Boundary Coverage

Applicable. `proposedPlanMd` remains proposal evidence. DecompositionPlan and
readiness are accepted planning artifacts and guards, not executor authority.
Scheduler worker outputs and IntegrationFix repaired patches remain proposals
until IntegrationCheck and human apply/discard gates complete.

## Goal Loop Boundary Coverage

Applicable. Goal Loop evidence assisted existing scheduler gates only. It did
not create workflow truth. The fixed resolver treats
`planning.scheduler.integration-check.run` as a manual barrier, so bounded
continuation cannot bypass the human IntegrationCheck confirmation.

## Module Boundary Coverage

Applicable. Main logic stayed in existing owners:

- `src/integration-check/aggregate-validation.ts`
- `src/workbench/planning/builders.ts`
- `src/workbench/projections/read-model/confirmation/goal-loop.ts`
- `src/workbench/actions/visible-goal-loop-current-gate.ts`

No broad facade or frontend shell gained new main workflow logic.

## Core Mechanism Reuse Coverage

Applicable. The change reused current-gate revalidation, workflow action target
requirements, Workbench confirmation queue, scheduler owners, IntegrationCheck,
IntegrationFix, Codex runtime artifacts, validation/audit, and source safety.
No feature-local state machine, permission layer, projection layer, or artifact
protocol was added.

## Documentation Entropy Coverage

Applicable. Handoff docs are updated at close only with current state and the
archive pointer. Historical run details stay in this archived summary/review
and `harness/changes/INDEX.json`.

## Experience Lifecycle Coverage

Not applicable. This is not a Harness evolution change.

## Transcript Renderer Source-Boundary Coverage

Not applicable. The default Workbench transcript renderer was not changed.

## Remote Handoff Acceptance Coverage

Not applicable. Remote handoff, PR, push, and merge were not touched or run.

## Close / Handoff Drift Coverage

Applicable. `AGENTS.md`, `docs/STATUS.md`, and
`docs/CURRENT-DEVELOPMENT-PLAN.md` are updated to remove the active path and
point to the archive path at close. Harness index is regenerated by script.
