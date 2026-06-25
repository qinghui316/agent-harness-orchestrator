# Spec: workbench-codex-plan-mode-post-plan-local-autonomy-v1

## Goal

Workbench planning should reuse Codex Plan Mode to produce a decision-complete planning proposal, while AHO keeps canonical artifact generation, human plan confirmation, and post-plan scoped local automation under its own gates.

## Users

- A developer using Workbench to turn an ordinary demand into a plan and local implementation.
- A future agent maintaining AHO planning and automation boundaries without adding redundant planner/runtime layers.

## Acceptance Criteria

- AC-001: `planning.generate` / `planning.revise` records a Codex planning proposal as `<proposed_plan>` when native or prompt-level Plan Mode succeeds, and falls back safely when it does not.
- AC-002: `PlanningArtifactBundle` stores proposal metadata compatibly while preserving existing goal, constraints, AC, design, tasks, spec, plan, tasks, and AC-map fields.
- AC-003: The proposed plan is proposal evidence only; user confirmation is still required before canonical `spec.md`, `plan.md`, `tasks.md`, or `ac-map.json` are written.
- AC-004: The planning confirmation card shows both `请求批准` and `完全访问权限`; selecting either one still submits `planning.confirm-execution`.
- AC-005: `planning.confirm-execution` is not added to scoped automation allowlists and cannot be consumed as a child automation gate.
- AC-006: If the user selected `完全访问权限`, post-plan automation starts only after canonical artifact writes succeed and only from a fresh current primary gate for the same Change.
- AC-007: Post-plan automation preserves existing exclusions for raw scheduler, integration apply/discard, remote, merge, PR, Harness evolution, scope drift, source drift, cross-change gates, stale artifacts, and provider/env blockers.
- AC-008: Workbench UI copy explains that the two modes are post-confirmation execution modes, not a way to skip plan confirmation.
- AC-009: Verification covers parser, planning bundle, confirmation payload, automation boundary, read-model/DOM behavior, and runtime bridge boundaries.

## Non-Goals

- Implementing a second planner, markdown AST parser, workflow runtime, permission system, or projection framework.
- Automatically confirming plans.
- Automatically executing integration apply/discard, remote push/merge/PR, Harness evolution, or raw `planning.scheduler.*` actions.
- Implementing full-auto project mode, full parallel executor, slot allocator, scheduler loop, or automatic child Change creation.

## Constraints

- Codex Plan Mode is a proposal source; AHO workflow truth remains accepted artifacts, Change/ECL, validation/audit, apply/close records, and scoped action revalidation.
- Native Plan Mode is best-effort because app-server collaboration mode support is version-dependent.
- Fallback prompt-level Plan Mode must not pretend native PlanDelta support exists.
- `README.md` remains unrelated and untracked.
- Real UI acceptance must use E drive, not C drive.

## Risks

- Native Codex app-server Plan Mode may be unavailable in some local Codex versions; fallback prompt contract must be explicit and tested.
- Codex proposed plans may omit scopes, AC, or tasks; AHO must surface warnings and keep readiness conservative.
- Starting automation from inside plan confirmation can accidentally fight the top-level in-flight guard unless it reuses the internal automation runtime path carefully.
- UI can mislead users if `完全访问权限` looks like skipping plan confirmation rather than selecting post-plan behavior.
