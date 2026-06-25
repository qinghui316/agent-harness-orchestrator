# Spec: workbench-loop-per-change-boundary-guard-v1

## Goal

AHO must enforce the execution boundary that one loop execution maps to one parent Change. Multiple worktrees may run inside that Change, but IntegrationCheck, scoped automation, and Goal Loop controlled continuation must not consume or merge evidence from another Change.

## Users

- Workbench users running long-lived demand conversations over multiple execution loops.
- Main agents choosing sequential, automation, scheduler, or integration strategies.
- Future scheduler/multi-worktree work that needs a stable parent-Change boundary.

## Acceptance Criteria

- AC-001: Same-Change ready worktrees can still produce and run an IntegrationCheck candidate.
- AC-002: Ready worktrees from different Changes do not produce one Workbench IntegrationCheck candidate.
- AC-003: Explicit `apply-check.run` requests with worktree ids from multiple Changes fail closed.
- AC-004: Workbench selected-Change projection only exposes an IntegrationCheck candidate for that selected Change.
- AC-005: Scoped automation stops before dispatching a child gate whose `changeId` differs from the authorization `changeId`.
- AC-006: Goal Loop controlled continuation stops before dispatching a controlled-advance child request whose `changeId` differs from the authorization `changeId`.
- AC-007: Archived Changes remain read-only for new implementation requests; follow-up work creates a new Change.
- AC-008: Maintenance review counting remains per terminal Change closeout, not per worktree, worker, or loop iteration.

## Non-Goals

- No child Change runtime.
- No full parallel executor, scheduler loop, slot allocator, or whole-wave dispatch.
- No cross-Change merge/landing implementation.
- No automatic integration apply/discard, remote push/merge/PR, or Harness evolution.
- No new workflow truth, permission system, memory system, evidence family, or projection framework.

## Constraints

- Reuse existing owners: `integration-check`, Workbench confirmation projection, `automation-runtime`, `goal-loop-runtime`, conversation lifecycle, and agent-task maintenance.
- Reference projects are evidence only. Open Dynamic Workflows informs run/journal boundaries; Symphony informs per-issue workspace and orchestrator-owned state boundaries. Do not vendor-copy code.
- Fail closed on missing, stale, forged, or cross-Change target ids.
- `README.md` remains unrelated and untracked.

## Risks

- Existing tests encode the old cross-demand IntegrationCheck behavior; they must be corrected without weakening same-Change integration coverage.
- Overbroad fixes could create a parallel permission/check framework; avoid that by adding guards in current shared owners.
- Project-wide candidate lookup still needs a deterministic fallback when no selected Change is provided, but Workbench selected-topic mode must stay Change-scoped.
