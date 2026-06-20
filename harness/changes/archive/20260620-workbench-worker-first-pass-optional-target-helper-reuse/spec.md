# Spec: Workbench Worker First Pass Optional Target Helper Reuse

## Goal

Reduce repeated Workbench first-pass scheduler worker target-scope checks by reusing the existing optional string target helper.

This is a bounded Architecture Growth Control step. The Workbench action boundary should keep action-specific target wiring, while shared optional scalar comparison behavior stays in `active-target.ts`.

## Users

- Maintainers extending scheduler worker Workbench actions.
- Agents reviewing stale-target and scoped action target revalidation.

## Acceptance Criteria

- AC-001: `planning.scheduler.worker.validate-first` uses `assertWorkbenchActionOptionalStringTarget` for equivalent optional scalar target checks.
- AC-002: `planning.scheduler.worker.audit-first` uses `assertWorkbenchActionOptionalStringTarget` for equivalent optional scalar target checks.
- AC-003: Optional-latest checks for existing validation/audit records remain local.
- AC-004: Boundary tests assert helper adoption for both action paths.
- AC-005: Verification includes targeted Workbench module boundary coverage, TypeScript/product gates, build, and Harness checks, with full/slow suite skip rationale recorded.

## Non-Goals

- Do not add a new helper or target validation framework.
- Do not refactor rework paths or the full scheduler worker chain.
- Do not change workflow truth, action ids, request payload shapes, ToolPolicyGate behavior, human gates, scheduler execution semantics, or runtime authority.
- Do not modify reference projects or the unrelated untracked `README.md`.

## Constraints

- Reuse existing owner module `src/workbench/actions/active-target.ts`.
- Keep `src/workbench/actions/boundary.ts` as action-specific boundary glue.
- Preserve fail-closed behavior for optional latest worker result fields by normalizing missing latest values to `""` when the request supplies a target.
- Existing helper wording may standardize mismatch text to `target scope mismatch`; record that honestly.

## Risks

- Folding optional-latest checks into the helper would change absent-evidence semantics.
- Replacing too many scheduler/rework paths in one change would expand validation scope and review risk.

