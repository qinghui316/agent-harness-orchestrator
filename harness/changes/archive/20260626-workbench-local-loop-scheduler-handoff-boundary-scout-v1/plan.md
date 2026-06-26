# Plan: workbench-local-loop-scheduler-handoff-boundary-scout-v1

## Approach

Use the existing local loop and scheduler machinery as the thing under test.
Start with code and reference review to verify the intended boundary, then run
an E-drive real UI scout. Only if the scout exposes a concrete gap, patch the
smallest owner path.

## Steps

1. Record the active change scope and acceptance criteria.
2. Review relevant Goal Loop, automation, scheduler confirmation, current-gate
   revalidation, and Workbench projection owners.
3. Run targeted Workbench/Goal Loop suites and build preflight.
4. Prepare `E:\aho-accept\local-loop-scheduler-handoff-v1` as an external
   sandbox and serve it through Workbench.
5. Verify `请求批准`: confirmed low-conflict plan stops at the real next gate.
6. Verify `完全访问权限`: raw scheduler preparation remains manual, while a
   supported controlled scheduler gate is exposed only through
   `planning.goal-loop.controlled-continue.run`.
7. If a blocker appears, classify and fix the owner path with a targeted test.
8. Record acceptance evidence, run Harness checks, close, and git settle.

## Decisions

- Workbench SQLite remains runtime bridge / interaction store, not workflow
  truth. No central DB is added in this change.
- References confirm the direction: Codex Goal continuation, Loop
  Engineering, ODWF, and Symphony all preserve observe/reconcile loops while
  keeping execution bounded by explicit artifacts and gates.
- Real UI evidence proved two small product-surface gaps, so the
  implementation stayed inside the existing read-model and DecisionPanels
  owners.

## Minimality Gate Plan

- Can this be a no-op: yes, if existing owner paths already satisfy the
  acceptance criteria; then close with evidence only.
- Reuse: existing owner/helper/mechanism considered: local Goal Loop
  coordinator, scoped automation runtime, current-gate revalidation,
  scheduler controlled continuation projection, Workbench confirmation queue.
- Shared root fix: if a gap appears, inspect the shared projection/action
  revalidation/runtime owner before adding a caller-local guard.
- Avoided: central workflow DB, raw scheduler allowlist expansion, new
  workflow runtime, new permission system, new projection framework.
- Smallest coherent change: targeted owner fix plus one deterministic test, or
  no product code if the scout passes.

## Module Boundary Plan

- Owner module: existing `src/goal-loop-runtime/`,
  `src/automation-runtime/`, `src/workbench/actions/`,
  `src/workbench/projections/read-model/confirmation/`, or scheduler runtime
  owner depending on the actual gap.
- New / moved responsibilities: none planned.
- Facade touch points: keep broad Workbench/server/App facades as thin wiring
  only if touched.
- Forbidden write-back locations: do not add main logic to `chat.ts`,
  `workbench-server.ts`, `read-model.ts`, `App.tsx`, manager facades, or type
  barrels by default.
- Compatibility surface: Workbench action ids, payloads, snapshot shape, and
  public UI mode labels should remain compatible.
- Boundary tests: targeted runtime/projection/DOM tests for any product fix.
- Follow-up split candidates: none.
- If not applicable, reason: no product code may be needed.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: confirmation queue primary gate,
  scoped automation allowlist, controlled scheduler wrapper,
  current-gate/stale-target revalidation, ToolPolicy/high-impact gate
  boundaries, artifact-first scheduler evidence.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is currently proposed.
- Domain-specific logic location: scheduler handoff logic stays in existing
  scheduler/Goal Loop projection and runtime owners.
- Shared cross-cutting logic location: target freshness and same-Change checks
  stay in current-gate revalidation/action owners.
- Local framework / state machine / projection / validation / gate avoided:
  avoid new loop DB, workflow engine, permission system, projection framework,
  and evidence family.
- Future-cost reduction for similar features: real UI evidence clarifies
  whether future local loop work can reuse the controlled scheduler wrapper.
- If not applicable, reason: not applicable only if no product code changes.

## Planning-Discovered Gaps

Real UI scout found two bounded gaps:

1. After controlled scheduler progression produced
   `scheduler-integration-candidate-14264028`, the authoritative
   `confirmationQueue.primary` correctly showed manual
   `planning.scheduler.integration-check.run`, but
   `decisionInspector.primary` still surfaced an older single-worktree result
   review card. Fixed in the decision inspector alignment owner.
2. The visible manual IntegrationCheck card still offered `完全访问权限`
   because Goal Loop helper actions were automation-eligible even when their
   `goalLoopCurrentGateActionType` pointed at a terminal/manual gate. Fixed in
   `DecisionPanels` by denying scoped automation wrapping for terminal human
   current gates.

No workflow DB, permission system, workflow runtime, or raw scheduler allowlist
change was required.

