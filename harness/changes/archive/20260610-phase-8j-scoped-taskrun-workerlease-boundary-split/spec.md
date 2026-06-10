# Spec: Phase 8J Scoped TaskRun WorkerLease Boundary Split

## Goal

Make TaskRun / WorkerLease coordination safer and easier to evolve by:

- ensuring low-level TaskRun evidence is scoped by the owning Change;
- preventing cross-change coder Run or workflow-result evidence from being
  attached to the wrong TaskRun;
- splitting the TaskRun manager into clear domain modules while retaining the
  existing public facade.

## Users

- Developers using Workbench or CLI-driven TaskRun / TaskQueue flows.
- Future maintainers extending TaskRun, WorkerLease, WorkflowRun recovery, or
  TaskQueue orchestration.
- Harness reviewers auditing evidence chains and fail-closed boundaries.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8I closed and Phase 8J active, with no
  stale Phase 8I active/current claim.
- AC-002: `reconcileTaskRuns()` matches coder Run evidence by both
  `taskRunId` and `changeId`.
- AC-003: TaskRun start/running/completion updates cannot cross Change
  boundaries or bind forged same-id evidence.
- AC-004: Workflow-result code run / worktree links must match the TaskRun
  change/task scope or fail closed / omit unsafe links.
- AC-005: `src/task-run/manager.ts` is a compatibility facade, not the main
  implementation file.
- AC-006: TaskRun schemas/types, artifact paths, repository, lease service,
  start/retry, reconcile, workflow-result, and guard logic have clear module
  boundaries.
- AC-007: Old public imports from `src/task-run/manager.ts` remain compatible.
- AC-008: TaskRun / WorkerLease artifact paths, JSON shape, status values,
  Workbench projections, action payloads, decision/audit scope, SSE, and thread
  storage remain unchanged.
- AC-009: `reconcileTaskRuns()` remains evidence reconstruction only and does
  not call coder, validator, or auditor agents.
- AC-010: New `src/task-run/*` modules do not reverse-depend on the manager
  facade, Workbench, server, web UI, or CLI command modules.
- AC-011: No new runtime/action/route/CLI command/scheduler/parallel/
  multi-Change/ODWF JS runtime/cache replay is introduced.
- AC-012: Full product and Harness verification pass, or any pre-existing
  failure is clearly recorded.

## Non-Goals

- Do not change TaskQueue or WorkflowRun behavior except where needed to pass a
  scoped TaskRun context to the TaskRun facade.
- Do not change CLI command names, options, outputs, or Workbench JSON shapes.
- Do not migrate all external imports away from `src/task-run/manager.ts`.

## Constraints

- Structured ECL files must be filled before code edits.
- `README.md` is unrelated and must remain excluded.
- Use UTF-8 for documentation and source edits.
- Preserve compatibility for existing public symbols exported by
  `src/task-run/manager.ts`.

## Risks

- TaskRun completion is called by WorkflowRun recovery paths; tightening scope
  must not break normal internal calls.
- Refactoring can accidentally alter artifact ordering or JSON shape if helpers
  are rewritten rather than moved.
- Reconcile must stay non-executing; adding evidence validation must not trigger
  agent runs.
