# Spec: workbench-planning-decomposition-scope-honesty-v1

## Goal

Make Workbench planning and decomposition scope honest before scheduler execution is exposed. A low-conflict TaskGraph candidate is scheduler-ready only when its source scopes are explicit, non-overlapping, dependency-free, and accepted without silent expansion.

## Users

- Developers using Workbench to ask for small, explicitly scoped multi-file changes.
- Future agents reading ECL artifacts to decide whether scheduler/worktree execution is safe.

## Acceptance Criteria

- AC-001: Explicit source scopes from a user demand are preserved through planning and DecompositionPlan units.
- AC-002: A low-conflict two-file demand with two non-overlapping accepted scopes can reach `ready-for-scheduler-contract`.
- AC-003: If planning/decomposition adds tests, indexes, docs, or other files outside the accepted constrained scopes, that expansion is recorded and scheduler readiness is blocked until accepted.
- AC-004: Missing, vague, overlapping, or dependency-linked source scopes do not reach scheduler-ready.
- AC-005: Workbench does not show bounded scheduler continuation / full-access scheduler path when scope expansion is unresolved.
- AC-006: Raw `planning.scheduler.*` actions remain outside the direct `完全访问权限` allowlist.

## Non-Goals

- Do not implement a full parallel executor, scheduler loop, slot allocator, child Change creation, or automatic apply/close/merge.
- Do not add a new planning runtime, workflow script engine, evidence family, or permission system.
- Do not make UI state, Goal Loop evidence, or SchedulerContract evidence workflow truth.

## Constraints

- Reuse existing planning bundle, DecompositionPlan, DecompositionReadinessManifest, SchedulerContract, confirmationQueue, and current-gate revalidation mechanisms.
- Planning remains human-confirmed before execution.
- High-impact gates remain human-confirmed.
- Reference source is evidence only; do not vendor-copy reference project code.

## Risks

- Scope extraction is heuristic in deterministic fallback paths; tests must focus on explicit source strings and fail closed for ambiguous cases.
- Blocking scheduler-ready may reduce automation in edge cases; this is acceptable when source scope cannot be proven.

