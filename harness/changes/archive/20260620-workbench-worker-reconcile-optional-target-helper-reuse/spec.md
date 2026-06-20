# Spec: Workbench Worker Reconcile Optional Target Helper Reuse

## Goal

Reduce repeated Workbench action target-scope checks in the scheduler worker reconcile-result boundary by reusing the existing optional string target helper.

This change is a narrow Architecture Growth Control step: boundary code should describe action-specific relationships, while shared optional scalar target comparison rules stay in the Workbench action target helper owner.

## Users

- Maintainers extending Workbench workflow actions.
- Agents reviewing action target revalidation and Scheduler/Workbench boundaries.

## Acceptance Criteria

- AC-001: `planning.scheduler.worker.reconcile-result` reuses the existing optional string target helper for scalar scope checks that match the helper contract.
- AC-002: Optional-latest checks such as existing WorkerResult remain local unless their semantics match the helper contract.
- AC-003: Boundary tests cover helper behavior and assert the reconcile-result path uses the shared helper for the selected scalar fields.
- AC-004: Verification is targeted and documented, with broader/full tests skipped only with rationale.

## Non-Goals

- Do not add a new Workbench action target helper.
- Do not refactor the full scheduler worker/rework chain in this change.
- Do not change workflow truth, action ids, request payload shapes, ToolPolicyGate behavior, stale revalidation requirements, or human gates.
- Do not modify unrelated documentation or the untracked `README.md`.

## Constraints

- Reuse existing owner module `src/workbench/actions/active-target.ts`.
- Keep `src/workbench/actions/boundary.ts` as action-specific boundary glue.
- Preserve existing public exports and action behavior.
- Treat reference projects as design evidence only; no runtime copying is needed for this internal helper reuse.

## Risks

- Replacing checks too broadly could change semantics for optional-latest targets that can be missing.
- Over-expanding into adjacent scheduler worker actions would make verification slower and increase merge risk.

