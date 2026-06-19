# Spec: Workbench Action Scalar Target Helper Reuse

## Goal

Strengthen the existing Workbench action target revalidation owner by moving repeated optional scalar target-id scope checks into `src/workbench/actions/active-target.ts`.

This is an Architecture Growth Control change. It reduces repeated feature-local target validation in `boundary.ts` without changing Workbench actions, scheduler runtime behavior, IntegrationCheck behavior, ToolPolicyGate, or human gates.

## Acceptance Criteria

- AC-001: `src/workbench/actions/active-target.ts` exports a pure helper for optional scalar string target checks.
- AC-002: The helper preserves existing semantics: missing or empty requested values are no-op, matching values are no-op, and mismatches throw `${label} ${targetName} target scope mismatch.`.
- AC-003: `src/workbench/actions/boundary.ts` reuses the helper for the seven existing scheduler integration/complete scalar target checks in scope.
- AC-004: Existing error text is preserved by passing target names such as `SchedulerIntegrationCandidate`, `applyCheckId`, and `schedulerReconcileSnapshotId`.
- AC-005: Module-boundary tests cover the helper behavior and assert that the in-scope boundary call sites use it.

## Non-Goals

- Do not change scheduler runtime, IntegrationCheck, action payloads, Workbench UI, `workflow-actions/registry.ts`, package scripts, Goal Loop, ToolPolicyGate, human gates, manager facades, or source apply behavior.
- Do not extract the broader scheduler revalidation block from `boundary.ts`.
- Do not replace the many earlier worker-chain optional scalar checks in this phase; they remain future Architecture Growth Control candidates.
- Do not include unrelated `README.md` changes.

## Constraints

- `active-target.ts` must stay pure and must not import scheduler runtime, repositories, Workbench UI, server, ToolPolicy, or Goal Loop modules.
- Reference projects are design evidence only. This internal helper reuse has enough local evidence and does not require reading reference source.
