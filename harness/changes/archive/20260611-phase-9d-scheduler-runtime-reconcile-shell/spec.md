# Spec: Phase 9D Scheduler Runtime Reconcile Shell

## Goal

Introduce a SchedulerRun-scoped runtime shell that can be initialized and
reconciled without starting parallel execution. The shell gives future executor
work a durable state boundary and recovery checkpoint while preserving all
existing Harness truth and human-gate rules.

## Users

- AHO users reviewing a selected demand's parallel-readiness path in Workbench.
- Future scheduler-runtime implementers who need a clear boundary between
  pre-execution typed evidence and actual worker execution.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 9C archived and Phase 9D active, with no
  stale Phase 9C active claim.
- AC-002: `SchedulerRun` remains the only scheduler run identity and its JSON
  shape is unchanged.
- AC-003: Runtime shell state, runtime events, and reconcile snapshots are stored
  as SchedulerRun-scoped sidecar artifacts.
- AC-004: `planning.scheduler.runtime.initialize` requires `changeId +
  schedulerRunId`, rejects stale/forged/cross-change/superseded/hash-mismatched
  targets, and fails closed on duplicate initialization.
- AC-005: `planning.scheduler.runtime.reconcile` requires initialized runtime
  state and writes a reconcile snapshot without creating execution records.
- AC-006: Runtime state/events/snapshots derive canonical scope from
  SchedulerRun and reject caller-forged canonical scope.
- AC-007: Workbench surfaces runtime shell and reconcile summaries, with full
  details lazy-loaded, and does not expose parallel start/worker/slot/lease
  controls.
- AC-008: `src/scheduler-runtime/*` does not depend on Workbench, server, web UI,
  CLI command modules, or broad facades.
- AC-009: No WorkflowRun, TaskQueueRun, TaskRun, WorkerLease, AgentTask,
  WorkerSession, RuntimeWorkspace, EventSource, worktree, run, child Change,
  scheduler loop, slot allocator, coder, validator, auditor, or ToolPolicy
  authorization is created or started.
- AC-010: Full product and Harness verification pass, or any pre-existing
  failure is clearly recorded.

## Non-Goals

- Full scheduler runtime or parallel executor.
- Worker claim/lease allocation, worker session creation, source-root mutation,
  or agent role execution.
- Changing existing SchedulerContract, dry-run, worker-plan, claim/reconcile
  plan, launch-preflight, SchedulerRun, Runtime Continuity, Run, Validation, or
  Audit public artifact shapes.
- Adding CLI commands or new standalone HTTP route families.

## Constraints

- Runtime shell implementation belongs to `src/scheduler-runtime/`, not
  `src/workflow-scheduler/` or Workbench facades.
- Existing SchedulerRun remains the recovery anchor; 9D may only add sidecar
  artifacts under that identity.
- ToolPolicyGate and human gate are future execution requirements, not
  pre-authorized by 9D.
- `README.md` remains unrelated and untracked.

## Risks

- Confusing SchedulerRun with an executing scheduler could make UI and action
  copy unsafe; Workbench text must keep the shell/reconcile wording explicit.
- Adding a second scheduler run identity would fragment recovery semantics; this
  phase forbids that.
- Reconcile logic could accidentally drift into real claim/slot allocation; tests
  must assert no execution/runtime worker artifacts are created.
