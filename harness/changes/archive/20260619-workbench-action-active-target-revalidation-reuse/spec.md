# Spec: workbench-action-active-target-revalidation-reuse

## Goal

Converge one repeated Workbench gate/action target revalidation pattern into an owned reusable helper so future high-impact Workbench actions do not each reimplement active Change target lookup.

## Users

- AHO maintainers extending Workbench action/gate handling.
- Future agents implementing scoped Workbench actions under Architecture Growth Control.

## Acceptance Criteria

- AC-001: A shared helper under `src/workbench/actions/` resolves an explicit `changeId` to the matching active Change target and fails closed with action-specific stale/missing active Change errors.
- AC-002: `src/workbench/actions/boundary.ts` reuses that helper for repeated active Change target lookup while preserving existing domain-specific artifact/status/lineage validation.
- AC-003: Public Workbench action ids, request payload shapes, ToolPolicyGate behavior, human gates, Goal Loop non-execution boundary, Scheduler non-execution/single-step gate boundary, and route/API behavior remain compatible.
- AC-004: Review evidence records Module Boundary, Scoped Workbench Action Payload, Proposal/Runtime or Goal Loop/Scheduler boundary implications where applicable, and Core Mechanism Reuse / Architecture Growth Control coverage.
- AC-005: Verification includes harness checks and product checks sufficient for a behavior-preserving TypeScript refactor.

## Non-Goals

- Do not introduce a new gate framework, scheduler runtime, Goal Loop controller behavior, action dispatcher, or validation system.
- Do not move domain-specific checks for planning bundles, decomposition plans, Goal Loop packet/policy lineage, scheduler lineage, worker evidence, IntegrationCheck handoff, TaskQueue, or WorkflowGraph artifacts into the active-target helper.
- Do not touch frontend, server route shapes, manager facades, or README.

## Constraints

- Current workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Workbench actions must carry explicit target ids and fail closed on stale, forged, or cross-change targets.
- Helper ownership stays inside the Workbench action module; broad facades must not gain new main logic.
- Reference projects are design evidence only; this change must not copy reference runtime code.

## Risks

- Over-broad extraction could hide action-specific stale-target rules in a generic helper.
- Error text drift could break existing tests or make user-facing failure evidence less precise.
- A helper used incorrectly could make future agents think resolving an active Change is sufficient to authorize a gate; review must state that it is only the first target lookup step.
