# Spec: workbench-two-tier-scoped-automation-authorization-v1

## Goal

Give Workbench users a clear two-tier authorization choice for the current
demand:

- `请求批准`: the current default, where each key step is explicitly confirmed.
- `完全访问权限`: one human confirmation authorizes AHO to auto-advance the
  current demand through already implemented, allowed local workflow actions
  until it reaches a blocker, unsupported gate, budget limit, or high-impact
  human gate.

Codex may run with full-access runtime capability, but AHO product authority
remains scoped to the current `projectId + changeId` and current evidence.

## Users

- Primary: local Workbench users who want AHO to continue the ordinary
  demand-to-code workflow without repeatedly clicking each low-risk stage.
- Secondary: future agents and maintainers who need the automation boundary to
  remain understandable, testable, and reusable without another pile of local
  state machines.

## Acceptance Criteria

- AC-001: Workbench exposes exactly two authorization modes for the current
  demand surface: `请求批准` and `完全访问权限`.
- AC-002: Confirming `完全访问权限` creates a scoped automation authorization
  bound to the current `projectId`, `changeId`, visible primary gate, source
  state, accepted artifact hashes, allowed action set, budget, and human
  confirmation evidence.
- AC-003: Codex full-access runtime capability is recorded as runtime
  capability only and does not expand AHO's allowed workflow action set.
- AC-004: The automation runtime rereads the Workbench snapshot before every
  child step and consumes only the current authoritative
  `confirmationQueue.primary`.
- AC-005: Allowed V1 actions are limited to local low-risk workflow actions:
  `planning.confirm-execution`, `planning.decomposition.confirm`,
  `planning.decomposition.assess-readiness`, `code.run`, `validate.run`,
  `audit.run`, `result.refresh-rework`, `result.revalidate`,
  `result.reaudit`, and `planning.goal-loop.controlled-continue.run`.
- AC-006: Automation stops, without executing, when the current primary gate is
  an approval/high-impact terminal gate such as `result.apply`,
  `change.close`, remote push/merge, remote landing, Harness evolution apply,
  or any unsupported action.
- AC-007: The server endpoint and automation child executor share current-gate
  revalidation logic; automation may bypass only the top-level in-flight
  self-block, not required target validation, stale checks, ToolPolicyGate, or
  handler owner checks.
- AC-008: Stale, missing, forged, cross-change, source-drift, or accepted
  artifact hash drift targets fail closed.
- AC-009: While automation is running, Workbench does not show a duplicate
  primary gate for the selected demand; stop/interrupt/steer controls remain
  available when supported.
- AC-010: The UI does not advertise fake full-auto, parallel executor, merge
  queue, slot allocator, automatic apply, or automatic close behavior.
- AC-011: The implementation uses owned modules and existing shared mechanisms
  rather than adding a parallel action registry, permission system, projection
  system, or workflow truth.

## Non-Goals

- Full global automation across projects or demands.
- Parallel worktree executor or conflict-aware whole-wave scheduler.
- Automatic source apply, close/archive, merge, remote push/merge, Draft PR
  landing, or Harness evolution apply.
- Turning GoalLoopDecision, packets, controller policies, UI state, Codex
  sessions, or Codex runtime permissions into AHO workflow authority.

## Constraints

- All write-capable or high-impact child actions must carry explicit
  `changeId` and required target ids.
- Every child step must reread current evidence and revalidate target scope
  before execution.
- Workbench `confirmationQueue.primary` remains the authoritative executable
  surface for V1 automation.
- Codex full-access runtime capability is allowed, but AHO boundary checks must
  not depend on Codex sandboxing.
- New main logic must live in owned modules, not broad compatibility facades.

## Risks

- Risk: adding a new automation runtime could become a parallel workflow state
  machine. Mitigation: it only consumes current `confirmationQueue.primary` and
  reuses existing action registry, target revalidation, ToolPolicyGate, and
  handlers.
- Risk: Codex full-access wording could imply unbounded product authority.
  Mitigation: UI copy and artifacts distinguish runtime capability from AHO
  scoped workflow authorization.
- Risk: automation child dispatch could bypass in-flight or stale guards.
  Mitigation: top-level human confirmation owns one in-flight run; child
  dispatch reuses current-gate revalidation and ToolPolicy checks.
