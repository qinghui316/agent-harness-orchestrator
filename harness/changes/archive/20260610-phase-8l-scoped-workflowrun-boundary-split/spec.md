# Spec: Phase 8L Scoped WorkflowRun Boundary Split

## Goal

Ensure WorkflowRun runtime evidence cannot cross Change or queue boundaries, then
make the WorkflowRun implementation modular enough for future recovery/runtime
work without editing one mixed manager file.

## Users

- AHO operators using Workbench TaskQueue / WorkflowRun projections.
- Future AHO implementers extending recovery, resume, and queue execution.
- Harness reviewers checking that runtime evidence remains scoped and
  non-authoritative.

## Acceptance Criteria

- AC-001: Docs record latest Harness evolution closed, Phase 8L active, and no
  stale Phase 8K active or pending claim remains.
- AC-002: `readWorkflowRun()` rejects a WorkflowRun whose persisted `changeId`
  does not match the requested Change.
- AC-003: `listWorkflowRuns()` and `getLatestWorkflowRun()` do not expose
  misplaced or cross-Change WorkflowRuns to projections.
- AC-004: `readWorkflowRunEvents()` rejects event rows whose `workflowRunId` or
  `changeId` does not match the validated WorkflowRun.
- AC-005: WorkflowRun event append preserves canonical `workflowRunId`,
  `changeId`, `type`, and `timestamp`; caller input cannot override them.
- AC-006: `appendWorkflowTaskEvent()` cannot append through a forged or
  misplaced WorkflowRun.
- AC-007: WorkflowRun lifecycle sync rejects cross-Change or cross-queue
  binding between WorkflowRun and TaskQueueRun.
- AC-008: `src/workflow-run/manager.ts` becomes a compatibility facade; schemas,
  paths, repository, events, guards, recovery key, proposal-start validation,
  lifecycle sync, stage resume, and summary logic live in owned modules.
- AC-009: WorkflowRun artifact paths, JSON shape, event names, summary shape,
  recovery key semantics, Workbench projections, action payloads, and
  decision/audit scope do not change.
- AC-010: `task.queue.reconcile` remains non-executing and recovery key mismatch
  continues to block resume.
- AC-011: New `src/workflow-run/*` modules do not depend on the manager facade,
  Workbench, server routes, web UI, or CLI command modules.
- AC-012: No runtime/action/route/CLI command/scheduler/parallel/multi-Change
  auto creation/ODWF JS runtime/cache replay capability is introduced.
- AC-013: Product and Harness verification pass, or any pre-existing failure is
  clearly recorded.

## Non-Goals

- Do not split generic Run or Change managers in this phase.
- Do not change Workbench route, projection, action, or SSE public shapes.
- Do not promote WorkflowRun to workflow truth.

## Constraints

- Preserve compatibility exports from `src/workflow-run/manager.ts`.
- Direct read APIs fail closed for invalid scope; projection list APIs skip bad
  WorkflowRun files so a first-screen Workpad does not crash because of one bad
  artifact.
- `README.md` remains unrelated and untracked unless explicitly requested.

## Risks

- Event append helpers currently take broad input objects; guard implementation
  must prevent canonical event-field override without changing event shape.
- Queue sync is called by TaskQueue internals; scope checks must reject forged
  direct calls while preserving the valid confirm-start, resume, and reconcile
  path.
