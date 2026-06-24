# Spec: Goal-Driven Controlled Continuation Runtime V1

## Goal

Enable a Workbench user to confirm one bounded continuation action that advances
the current selected demand through multiple existing controlled Scheduler
steps, while preserving evidence freshness, scoped targets, ToolPolicy audit,
and human gates for terminal/high-impact decisions.

## Users

- Primary: a developer using Workbench to progress a demand without repeatedly
  confirming the same safe controlled Scheduler continuation surface.
- Secondary: future agents that need a clear runtime boundary for Goal-driven
  continuation without confusing it with full automation.

## Acceptance Criteria

- AC-001: Workbench exposes `planning.goal-loop.controlled-continue.run` only
  when the selected active demand has a supported current concrete Scheduler
  gate and matching fresh Goal Loop packet, controller policy, and gate-readiness
  preflight evidence.
- AC-002: The action payload carries `changeId`, the concrete Scheduler gate
  target ids, `goalLoopNextStepPacketId`, `goalLoopControllerPolicyId`,
  `goalLoopGateReadinessPreflightId`, `goalLoopCurrentGateActionType`, and
  `maxSteps`.
- AC-003: Server-side revalidation rejects stale, missing, forged, cross-change,
  unsupported, or mismatched continuation targets before any child step runs.
- AC-004: One human confirmation creates a scoped runtime authorization and one
  runtime run record. Child iterations reference that authorization and do not
  pretend to be separate user clicks.
- AC-005: Each child iteration re-reads current evidence and dispatches only the
  existing `planning.scheduler.controlled-advance.run` safety wrapper. It does
  not directly call concrete worker/start/validate/audit/apply/close handlers.
- AC-006: Each child iteration preserves existing required-target validation,
  current-action revalidation, ToolPolicy audit, and controlled Scheduler
  continuation guards.
- AC-007: The runtime stops at `maxSteps`, unsupported gate, stale target,
  active in-flight action, source-safety problem, blocker, IntegrationCheck /
  IntegrationFix barrier, apply/close/remote/Harness evolution gate, or handler
  failure, and records a clear stop reason.
- AC-008: While the continuation action is running, Workbench does not expose a
  duplicate primary confirmation for the same selected demand.
- AC-009: User-visible copy describes bounded continuation only; it does not
  advertise full-auto, whole-wave dispatch, parallel executor, merge queue, slot
  allocator, child Change creation, or automatic apply/merge/close.

## Non-Goals

- Do not implement full-auto task mode.
- Do not implement a multi-worktree parallel executor, whole-wave dispatch, slot
  allocator, child Change auto creation, automatic apply/merge/close, remote
  landing automation, or Harness evolution automation.
- Do not make GoalLoopDecision, GoalLoopNextStepPacket, controller policy,
  preflight, Workpad, Topic, SQLite, or UI state workflow truth.
- Do not lower the authority of existing high-impact Scheduler actions or remove
  ToolPolicy/human-gate checks.

## Constraints

- Runtime authority is scoped to the selected Change and the visible current
  gate at confirmation time.
- Default `maxSteps` is `5`; server hard cap is `10`.
- Child steps must not recurse through the top-level Workbench action service,
  because the top-level continuation action owns the in-flight lock.
- The implementation must reuse existing action registry, target revalidation,
  ToolPolicy, controlled Scheduler wrapper, and Workbench projection patterns.
- `README.md` remains unrelated and untracked.

## Risks

- The runtime could accidentally bypass the in-flight guard if child execution is
  wired through the wrong entrypoint.
- A broad action allowlist could turn this into full automation. V1 must allow
  only controlled Scheduler advance.
- Projection could show both the bounded continuation gate and the old single
  controlled-advance gate as primary. Tests must catch duplicate primary
  surfaces.
- Audit evidence could be misleading if child steps do not link to the scoped
  authorization.
