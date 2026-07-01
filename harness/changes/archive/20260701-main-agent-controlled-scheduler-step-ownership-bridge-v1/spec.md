# Spec: main-agent-controlled-scheduler-step-ownership-bridge-v1

## Goal

Introduce a main-agent ownership bridge for the existing controlled Scheduler
advance action. The bridge records main-agent WorkflowGraph observation around a
single existing controlled Scheduler transition while preserving the current
Workbench action boundary and Scheduler runtime authority.

## Users

- AHO developers maintaining the main-agent orchestration migration.
- Future main-agent Scheduler integration work that needs one clear ownership
  seam instead of direct Workbench-to-scheduler runtime calls.

## Acceptance Criteria

- AC-001: `planning.scheduler.controlled-advance.run` is handled through a
  main-agent bridge, not by a direct Workbench handler import of
  `runControlledSchedulerLoopStep`.
- AC-002: The bridge validates the active Change path before recording
  main-agent observation evidence; invalid/stale Change ids fail closed before
  scheduler delegation.
- AC-003: The bridge records pre-observation, delegates exactly one existing
  controlled Scheduler step, then best-effort records post-observation.
- AC-004: Pre-observation failure prevents delegation; delegate failure is
  rethrown unchanged; post-observation failure never converts a successful
  Scheduler step into a failure.
- AC-005: `controlledSchedulerRoute.kind` remains evidence/gap only and is not
  used as a V1 execution precondition.
- AC-006: No UI, action type, confirmation queue, action registry,
  revalidation, automation allowlist, ToolPolicyGate, apply/close, remote, PR,
  merge, or Harness evolution behavior changes.
- AC-007: Boundary tests prove that only the new bridge may import
  `scheduler-runtime/controlled-loop-step` from main-agent ownership code.

## Non-Goals

- Do not make `controlledSchedulerRoute` runtime authority.
- Do not create a second Scheduler gate, raw scheduler action payload, or
  parallel executor.
- Do not delete `scheduler-runtime` or `workflow-scheduler` owners.
- Do not change Workbench user-facing surfaces.

## Constraints

- Existing controlled Scheduler revalidation and runtime guards remain the
  executable safety boundary.
- Existing result shape and action summaries must remain compatible.
- Existing `controlled-scheduler-integration.ts` stays a pure non-executing
  route owner and must not import scheduler runtime.
- The implementation must preserve source safety and human gate boundaries.

## Risks

- If the bridge blocks on `controlledSchedulerRoute`, it would accidentally
  promote a read-only observation seam into runtime authority.
- If pre/post observation failures are not separated, the bridge could either
  write misleading evidence or mask real Scheduler execution errors.
- If scheduler runtime imports spread beyond the bridge, the ownership migration
  becomes another mixed old/new path.
