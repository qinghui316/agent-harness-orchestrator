# Spec: workbench-low-conflict-taskgraph-scheduler-reachability-v1

## Goal

After a user manually confirms a plan in the Workbench, AHO should be able to classify an accepted TaskGraph as low-conflict only when the task scopes are explicit and independent, then route the next product surface through the existing controlled scheduler continuation path. The user should see a bounded continuation decision, not a fake full parallel executor or a raw list of scheduler internals.

## Users

- Developers using Workbench demand conversations to complete a local project change.
- Future agents continuing a structured Change that needs to decide whether a task split is safe for scheduler-backed execution.

## Acceptance Criteria

- AC-001: A confirmed decomposition with at least two independent units, each with explicit non-overlapping source scopes and no dependencies, can produce `taskgraph-parallel-candidate` readiness with `nextAllowedAction = "scheduler.contract"`.
- AC-002: Ambiguous source scopes, overlapping source scopes, dependencies, or conflict edges prevent scheduler readiness and either block parallel guardrails or fall back to the existing sequential/single-change path.
- AC-003: Workbench exposes the supported scheduler path through the existing controlled continuation surface only when Goal Loop packet/controller/preflight evidence is fresh and matches the concrete scheduler gate.
- AC-004: `完全访问权限` does not directly allow raw `planning.scheduler.*` actions; it may consume the scheduler path only through `planning.goal-loop.controlled-continue.run`.
- AC-005: The visible Workbench surface uses user-facing bounded continuation wording and does not advertise full-auto, full parallel executor, start-all, slot allocator, automatic apply/close/merge, or raw internal scheduler buttons.
- AC-006: A real UI acceptance run in an E-drive sandbox records whether the low-conflict demand reaches the controlled scheduler path and stops at a real next gate, IntegrationCheck/result.apply, or a clearly classified blocker.

## Non-Goals

- No simultaneous wave dispatch or full parallel executor.
- No automatic child Change creation.
- No automatic apply, close/archive, merge, push, remote landing, or Harness evolution.
- No new permission system, projection system, scheduler framework, or evidence family.

## Constraints

- Change/ECL, accepted artifacts, run artifacts, validation/audit, IntegrationCheck, worktree state, and human gates remain workflow truth.
- Scheduler and Goal Loop artifacts remain evidence/controlled gates unless an existing action handler executes a scoped transition with target revalidation.
- Raw scheduler actions must not be added to scoped automation allowlist as a shortcut.
- `README.md` remains unrelated and untracked.

## Risks

- Over-classifying vague model-produced scopes as parallel-ready would create unsafe worktree fan-out.
- Adding direct scheduler automation would create a second executor and increase architecture debt.
- Real UI acceptance may expose a scheduler-runtime gap that is larger than this slice; if so, record the blocker instead of widening scope.
