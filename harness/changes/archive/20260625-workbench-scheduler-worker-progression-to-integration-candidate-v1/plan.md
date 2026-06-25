# Plan: Workbench Scheduler Worker Progression To Integration Candidate V1

## Approach

Start by proving the existing controlled scheduler path can already progress from worker one to worker two and compile an integration candidate. If the existing path is complete, add acceptance coverage and close with evidence. If a real gap appears, repair only the owning module that already owns that responsibility.

Reference alignment:

- Open Dynamic Workflows: borrow bounded leaf execution, event/journal discipline, and pipeline-before-barrier thinking only.
- Symphony: borrow orchestrator-owned dispatch/reconcile/blocked/workspace discipline only.
- Loop Engineering: main agent decides safe parallel vs sequential/rework/fix from fresh evidence.
- Codex: Codex receives an AHO-owned worktree as cwd; Codex thread/session state is not AHO workflow truth.

## Steps

1. Inspect the existing slow two-worker scheduler acceptance and unit coverage to identify the smallest deterministic test that proves progression to a ready candidate.
2. Run targeted scheduler/automation tests before editing to determine whether the product gap is absent, projection-only, revalidation-only, or runtime-owned.
3. If needed, repair the smallest existing owner:
   - scheduler progression/runtime gap -> `scheduler-runtime` or `workflow-scheduler`;
   - automation eligibility gap -> `automation-runtime` policy/runner while keeping raw scheduler actions disallowed;
   - current target mismatch -> Workbench current-gate revalidation;
   - user-surface gap -> Workbench confirmation/read-model/DOM projection;
   - candidate gap -> `scheduler-runtime/integration-candidate` or `integration-check` owner.
4. Add or tighten tests for same-Change worker progression, ready candidate generation, cross-Change fail-closed behavior, automation allowlist boundary, and Workbench surface honesty.
5. Run required verification, then perform E-drive real UI acceptance if product-visible code changed or if deterministic evidence is insufficient.
6. Close with summary/review evidence, update handoff docs, reindex, and git settle while excluding unrelated `README.md`.

## Decisions

- V1 target is "progression to IntegrationCandidate", not "full worker wave executor".
- `planning.scheduler.integration-check.run` remains a human gate.
- `完全访问权限` may consume only the existing controlled continuation wrapper for scheduler work.
- Source root remains unchanged until a later human integration/apply decision.

## Minimality Gate Plan

- Can this be a no-op: yes, if existing controlled scheduler coverage already proves two workers plus ready candidate; then only ECL evidence and possibly a focused acceptance test are needed.
- Reuse: existing scheduler runtime, workflow-scheduler, automation runtime, confirmation queue, current-gate revalidation, and integration candidate owner.
- Shared root fix: inspect scheduler action projection, action revalidation, automation policy, and candidate compilation before adding any local guard.
- Avoided: no new scheduler loop, permission system, workflow runtime, projection framework, evidence family, child Change framework, or raw scheduler allowlist expansion.
- Smallest coherent change: targeted tests plus only the minimal owner fix uncovered by diagnostics.

## Module Boundary Plan

- Owner module: existing `scheduler-runtime` / `workflow-scheduler` for progression, `automation-runtime` for scoped execution policy, Workbench confirmation/read-model for user surface, `integration-check` / scheduler candidate owner for candidate proof.
- New / moved responsibilities: none planned.
- Facade touch points: keep broad Workbench/server facades as thin dispatchers only if touched.
- Forbidden write-back locations: do not add main scheduler logic to `src/workbench/manager.ts`, broad server routes, `App.tsx`, or ad hoc UI state.
- Compatibility surface: existing action types and payload target ids remain compatible.
- Boundary tests: targeted unit/slow tests for scheduler progression, automation policy, current-gate revalidation, read-model/DOM, and candidate same-Change checks.
- Follow-up split candidates: none unless diagnostics reveal existing owner sprawl.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled scheduler wrapper, `SchedulerRun`, claim reservation, worker start/result/validation/audit artifacts, IntegrationCandidate compilation, Workbench confirmation queue, source/apply safety checks.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: scheduler-specific progression logic stays in scheduler owners; user copy stays in Workbench confirmation surface owners.
- Shared cross-cutting logic location: stale target / scope validation stays in current-gate revalidation and scheduler guards.
- Local framework / state machine / projection / validation / gate avoided: all avoided; V1 does not add a parallel executor.
- Future-cost reduction for similar features: proving the existing progression path reduces pressure to add more explanation layers or a duplicate scheduler.

## Planning-Discovered Gaps

None blocking. The main implementation risk is discovering that existing controlled continuation can only step one worker path manually; if so, the fix must extend the existing controlled wrapper rather than create raw scheduler automation.
