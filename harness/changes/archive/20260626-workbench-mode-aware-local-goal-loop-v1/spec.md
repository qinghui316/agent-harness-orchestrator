# Spec: workbench-mode-aware-local-goal-loop-v1

## Goal

Make the local Workbench loop mode-aware. Both approval modes should use the
same main-Agent loop semantics: observe current Change evidence, decide the next
legal gate, reconcile after progress, and stop at blockers. The permission mode
only controls whether the act phase waits for the user or consumes allowed local
gates automatically.

## Users

- Developers using Workbench to turn a natural-language demand into local code
  changes.
- Future agents resuming the Change and needing unambiguous loop authority.

## Acceptance Criteria

- AC-001: In `请求批准` mode, the loop does not dispatch work automatically; it
  leaves exactly one real current primary confirmation gate for the user.
- AC-002: In `完全访问权限` mode, after human plan confirmation, the loop starts
  from fresh evidence and may automatically consume only current-Change local
  allowed gates.
- AC-003: Both modes preserve `planning.confirm-execution` as a human gate.
- AC-004: Full-access mode does not consume raw `planning.scheduler.*`,
  manual IntegrationCheck, integration apply/discard, PR, remote, merge, or
  Harness evolution gates.
- AC-005: The coordinator fails closed on stale, missing, forged,
  cross-Change, source drift, or accepted-artifact drift evidence.
- AC-006: Workbench presents `请求批准` and `完全访问权限` as post-plan execution
  modes, not as a way to skip plan confirmation.
- AC-007: Close/archive completion suppresses stale old primary gates and
  records a completed or no-primary-gate outcome.

## Non-Goals

- Implementing a full workflow engine or a new permission system.
- Implementing PR/remote/merge flows.
- Implementing full parallel scheduler execution.
- Creating child Changes automatically.
- Making GoalLoopDecision, packets, preflight, UI state, or Codex sessions
  workflow truth.

## Constraints

- Reuse existing `automation-runtime`, `goal-loop-runtime`,
  current-gate revalidation, Workbench confirmation queue, ToolPolicy, source
  safety, and controlled scheduler wrapper.
- One loop execution is scoped to one Change.
- `README.md` remains unrelated and untracked.

## Risks

- Overbuilding a second workflow runtime instead of adding a thin coordinator.
- UI copy implying full-auto or skipping plan confirmation.
- Treating request-approval mode as "no loop" and losing the main-Agent
  observe/decide/reconcile model.
