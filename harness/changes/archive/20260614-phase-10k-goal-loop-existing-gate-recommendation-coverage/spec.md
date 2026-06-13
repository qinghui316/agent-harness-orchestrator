# Spec: Phase 10K Goal Loop Existing Gate Recommendation Coverage

## Goal

Goal Loop evaluation should be able to look at current scheduler evidence and recommend the next already-implemented Harness gate instead of falling back to generic waiting once a worker path exists.

The recommendation remains evidence only. The concrete transition still requires the existing scoped Workbench action, ToolPolicyGate / stale-target validation where applicable, and human confirmation.

## Users

- Main Agent: receives a more accurate next-step packet for complex Goal/Change continuation.
- Developer/user: sees recommendations that align with existing Harness gates and do not imply hidden automation.
- Future maintainers: can extend Goal Loop policy inside `src/goal-loop/` without writing scheduler policy into Workbench/server/frontend facades.

## Acceptance Criteria

- AC-001: Docs record Phase 10J closed and Phase 10K active, with no stale Phase 10J active claim.
- AC-002: Goal Loop can recommend current-worker result reconcile, validation, audit, rework plan, rework start, rework result reconcile, rework validation, rework audit, integration candidate refresh, start-next, IntegrationCheck handoff, and integration outcome reconcile when current evidence proves those existing gates are legal.
- AC-003: Every recommended action uses an existing `WorkflowActionType` and complete target ids accepted by `validateWorkflowActionRequiredTargets()`.
- AC-004: Goal Loop still does not execute recommended actions; `executionStarted` remains false and control policy keeps `canAutoContinue=false` and `canAutoExecuteRecommendedAction=false`.
- AC-005: Goal Loop does not create or mutate scheduler runtime, workers, TaskRuns, WorkerLeases, worktrees, runs, IntegrationChecks, apply records, close records, child Changes, or source files.
- AC-006: Recommendations stay inside `src/goal-loop/`; no new dependency on Workbench/server/web/CLI/action-handler broad facades.
- AC-007: Existing `planning.goal-loop.evaluate` public action shape remains compatible.
- AC-008: Product and Harness verification pass, or any pre-existing failure is recorded.
- AC-009: `README.md` remains unrelated and untracked.

## Non-Goals

- No Goal Loop controller artifact or hidden continuation runtime in this phase.
- No new action, route, CLI command, UI, lazy projection, or public JSON shape.
- No scheduler loop, start-all / whole-wave dispatch, slot allocator, full parallel executor, or child Change creation.
- No replacement of Change/ECL, accepted artifacts, scheduler evidence, Run/Validation/Audit, IntegrationCheck, Apply/Close, ToolPolicyGate, or human gates as workflow truth.

## Constraints

- Reuse existing scheduler and workflow action target semantics.
- Treat ambiguous or incomplete worker paths as waiting/blocked, not executable.
- Keep concrete confirmation queue as the authority for user-facing execution transitions.
- Keep new policy modular and owned by `src/goal-loop/`.

## Risks

- Over-recommending a transition when scheduler evidence is stale or incomplete.
- Accidentally creating a second execution surface beside the confirmation queue.
- Expanding imports from `src/goal-loop/` into Workbench/server/action-handler layers.
- Letting packet context be misunderstood as execution authority.
