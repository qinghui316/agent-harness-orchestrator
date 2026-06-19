# Spec: Workbench Action Array Target Helper Reuse

## Goal

Strengthen the existing Workbench action target revalidation owner by moving repeated array target matching out of `boundary.ts` and into `active-target.ts`.

## Users

- Future agents extending Workbench high-impact action revalidation.
- Maintainers reviewing scheduler IntegrationCheck / completion target-scope behavior.

## Acceptance Criteria

- AC-001: Workbench action target array matching is owned by `src/workbench/actions/active-target.ts`, with exact ordered matching and fail-closed behavior when the helper is called.
- AC-002: `src/workbench/actions/boundary.ts` reuses the shared helper for the existing scheduler `worktreeIds` target checks and no longer owns a private `sameStringArray` helper.
- AC-003: Existing runtime semantics remain unchanged: the scheduler `worktreeIds` checks still run only when the request carries non-empty `worktreeIds`, and mismatch errors keep their current action-specific messages.
- AC-004: Existing public API, Workbench action ids, ToolPolicyGate behavior, human gates, scheduler evidence authority, IntegrationCheck/apply behavior, and workflow truth remain unchanged.
- AC-005: Targeted tests and Harness checks pass with a recorded verification scope.

## Non-Goals

- Do not change scheduler execution, parallel execution, IntegrationCheck behavior, source apply, close/archive, ToolPolicyGate, human gates, action payload shapes, package scripts, or Workbench UI behavior.
- Do not move broader scheduler revalidation logic out of `boundary.ts`.
- Do not modify `workflow-actions/registry.ts`; its scope matching is a broader action-scope mechanism, not this Workbench latest-evidence target check.
- Do not include unrelated `README.md`.

## Constraints

- Preserve exact ordered array matching for `worktreeIds`.
- Preserve optional-request semantics: missing `request.worktreeIds` must not start failing in the three existing boundary checks.
- Keep the helper pure and independent from scheduler-runtime, goal-loop, ToolPolicy, server, web UI, and repositories.
- Follow the plan review subagent result `019ee232-f79c-70e1-80d8-00e4310edf4a` PASS.

## Risks

- Accidentally changing missing-request semantics could make valid existing actions fail; mitigate by keeping the guard around helper calls.
- A too-generic helper could duplicate `workflow-actions/registry.ts`; mitigate by keeping it scoped to Workbench action target revalidation.
- Large Workbench boundary changes could expand scope; mitigate by replacing only the three private array checks.
