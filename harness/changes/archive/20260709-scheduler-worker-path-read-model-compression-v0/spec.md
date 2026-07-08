# Spec: scheduler-worker-path-read-model-compression-v0

## Goal

Create a single canonical Scheduler worker-path read model that downstream
runtime, boundary, GoalLoop, closeout, and projection code can consume without
copying evidence assembly or terminal/pending policy.

## Users

Future implementers and reviewers of Scheduler / Workflow Runtime changes.
The user-visible product behavior should remain unchanged.

## Acceptance Criteria

- AC-001: Scheduler worker start/result/validation/audit/rework evidence is
  assembled by one scheduler-runtime read-model owner.
- AC-002: workflow-runtime Scheduler dispatch still performs authoritative
  stale, reservation, source-scope, barrier, and pre-dispatch fail-closed checks.
- AC-003: Workbench boundary, GoalLoop, closeout, and projection no longer own
  private worker-path terminal/pending policy.
- AC-004: Current transition behavior for same-wave, next-wave, integration,
  completion, and close remains unchanged.
- AC-005: Boundary tests prevent reintroducing private worker-path assembly in
  the covered modules.

## Non-Goals

- No Scheduler feature expansion or action payload changes.
- No WorkflowGraphPlan schema changes.
- No UI, Plan, Codex subagent, remote/apply/merge automation changes.

## Constraints

- New read model must be read-only and must not create artifacts, TaskRuns,
  WorkerLeases, worktrees, CodeRuns, or IntegrationCheck records.
- New read model must not import Workbench, GoalLoop, workflow-runtime, web, or
  server UI types.
- README.md remains out of scope.

## Risks

- If the read model only exposes a terminal boolean, closeout and projection
  will keep private forks. It must expose pending reasons and evidence refs.
- If the read model owns transition selection, it becomes a third Scheduler
  policy owner. Transition selection remains in workflow-actions and dispatch
  authority remains in workflow-runtime.

