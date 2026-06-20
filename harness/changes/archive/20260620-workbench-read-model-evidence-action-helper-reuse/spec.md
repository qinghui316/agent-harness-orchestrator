# Spec: workbench-read-model-evidence-action-helper-reuse

## Goal

Reduce Workbench read-model projection duplication by moving common evidence action construction into a single projection-layer owner.

## Users

- Users of the Workbench decision inspector and confirmation queue who need stable "view evidence" affordances.
- Future AHO developers and agents extending Workbench projections without repeating local helper logic.

## Acceptance Criteria

- AC-001: A read-model evidence action helper returns `[]` for missing artifacts, returns a default `查看证据` evidence action for present artifacts, and supports an optional custom label without changing id, kind, enabled, requiresConfirmation, or artifact fields.
- AC-002: `src/workbench/projections/read-model/decision-inspector.ts` no longer defines a local `evidenceActions` helper; result review, approval, history, queue blocker, task blocker, validation, and audit evidence action behavior remains compatible.
- AC-003: Touched confirmation projection modules use the read-model helper for optional artifact and optional label handling instead of local ternary/map patterns; existing action labels and evidence refs remain compatible.
- AC-004: The change does not modify workflow action runtime, approval command execution, human gates, source apply, remote landing, Goal Loop, Scheduler authority, ToolPolicyGate, or workflow truth.
- AC-005: Review records Read Model Projection, Workbench User-Surface Honesty, Module Boundary, and Core Mechanism Reuse coverage, with targeted verification and explicit rationale for skipped aggregate/full suites.

## Non-Goals

- No new user-facing feature, confirmation action type, server endpoint, runtime executor, source mutation path, remote mutation path, or reference project adoption.
- No broad rework of confirmation queue ordering, landing state machines, integration check behavior, or decision inspector prioritization.

## Constraints

- The owner module must live at read-model top level, not under `confirmation/`, because decision inspector and confirmation queues both consume the helper.
- `confirmation/shared.ts` should retain confirmation queue scoping, dedupe, and approval helper responsibilities; it must not remain the cross-cutting evidence action owner.
- Evidence actions remain projection affordances only. They must not become executable workflow truth.

## Risks

- Accidentally changing action labels or ids could break Workbench assertions or user-surface expectations.
- Over-broad refactoring could blur read-model projection boundaries or touch runtime gate logic.
