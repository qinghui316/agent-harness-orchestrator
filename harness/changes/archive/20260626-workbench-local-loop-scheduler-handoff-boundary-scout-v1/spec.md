# Spec: workbench-local-loop-scheduler-handoff-boundary-scout-v1

## Goal

Confirm that the local Goal Loop hands low-conflict TaskGraph work to the
existing controlled scheduler path without turning SQLite, UI state, raw
scheduler actions, or full-access mode into workflow authority.

## Users

- A developer using Workbench on a local project.
- Future AHO agents that need a clear scheduler handoff boundary before
  widening local loop behavior.

## Acceptance Criteria

- AC-001: Workbench SQLite is documented and reviewed as interaction,
  decision, projection, and continuity storage, not workflow truth.
- AC-002: In `请求批准` mode, after a low-conflict plan is confirmed, the local
  loop stops on the real current scheduler-related gate and does not dispatch
  scheduler work.
- AC-003: In `完全访问权限` mode, the local loop may consume only the existing
  controlled scheduler wrapper when the visible gate is a supported matching
  scheduler gate.
- AC-004: Raw `planning.scheduler.*`, manual IntegrationCheck, integration
  apply/discard, remote, merge, PR, and Harness evolution gates are not
  automatically consumed.
- AC-005: Stale, missing, cross-Change, source-drifted, or forged scheduler
  target ids fail closed.
- AC-006: Real UI acceptance records the visible gate sequence, sandbox paths,
  loop/automation evidence, worker artifacts or blocker classification, and
  source-root safety.

## Non-Goals

- Build a central workflow database.
- Build a full parallel executor, scheduler loop, slot allocator, child Change
  framework, or new workflow runtime.
- Add raw scheduler actions to the full-access allowlist.
- Auto-run manual IntegrationCheck, integration apply/discard, PR, remote,
  merge, or Harness evolution.

## Constraints

- Reuse existing Goal Loop, automation, scheduler, current-gate revalidation,
  Workbench read-model, and confirmation queue owners.
- Use E-drive external sandbox paths, not C drive and not the AHO development
  checkout as the managed source.
- Do not weaken ToolPolicyGate, current target validation, source safety,
  human gates, or same-Change guards.

## Risks

- Current controlled scheduler wrapper may expose a UI/projection gap only in
  real browser flow.
- Full-access may start an in-flight workflow while the visible confirmation
  card is not suppressed, causing a confusing duplicate primary action.
- External Codex or validation environment failures must be classified as
  environment/provider blockers rather than fake product success.

