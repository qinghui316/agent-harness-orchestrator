# Spec: main-agent-old-seam-retirement-v1

## Goal

Safely retire dead old-seam names after the main-agent role/queue/replay/policy/
bridge/recovery/controlled-Scheduler migration, without deleting compatibility
or safety surfaces that are still live.

## Users

- AHO maintainers and future agents reading the codebase.
- Workbench users who should see current main-agent language rather than old
  "role pipeline" labels.

## Acceptance Criteria

- AC-001: Seam inventory classifies `runCodeValidateAuditSequence`,
  `runTaskQueueSequence`, `task-queue-runner`, `role.pipeline.*`,
  `rolePipeline`, and `MainAgentLoopProjection` as dead, live-compat,
  live-boundary, or rename-only.
- AC-002: Production source does not reintroduce `runCodeValidateAuditSequence`,
  `runTaskQueueSequence`, or `task-queue-runner` as entrypoints.
- AC-003: User-visible wording no longer presents current execution as a
  "角色流水线" product concept where safe to change without API breakage.
- AC-004: `role.pipeline.*` action ids, `rolePipeline` read model, and
  `MainAgentLoopProjection` remain intact and covered as live compatibility or
  boundary seams.
- AC-005: No Scheduler, IntegrationCheck, confirmationQueue, action
  revalidation, automation allowlist, apply/close, remote, PR, merge, or
  Harness evolution authority changes are introduced.

## Non-Goals

- Do not rename public action ids or DTO fields in V1.
- Do not delete live Workbench read-model surfaces.
- Do not implement normal Agent mode.
- Do not change product UI layout or add controls.

## Constraints

- Old seam cleanup must be inventory-backed.
- Historical archive wording does not need to be rewritten.
- `README.md` is unrelated and must remain outside this change.

## Risks

- Deleting `rolePipeline` too early could re-expose stale confirmations during
  active role execution.
- Deleting `MainAgentLoopProjection` too early could remove a non-executing Goal
  Loop parity boundary before replacement coverage exists.
- Renaming `role.pipeline.*` action ids without aliases would break Workbench
  action dispatch.

