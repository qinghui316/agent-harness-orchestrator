# Plan: workbench-planning-decomposition-scope-honesty-v1

## Approach

Implement the smallest owner-local change in the existing planning/readiness path. Add scope constraint metadata to the current planning bundle / decomposition artifacts, derive scope expansion from existing task/unit scopes, and make readiness block scheduler-ready when expanded scopes are not accepted. Do not introduce a new workflow runtime or scheduler framework.

## Steps

1. Add targeted tests for explicit two-file success, silent expansion blocking, vague/overlap/dependency blocking, Workbench projection suppression, and automation allowlist preservation.
2. Extend existing planning/decomposition artifact types and schemas with minimal scope honesty fields.
3. Update deterministic planning/decomposition builders to preserve accepted explicit scopes and record expansion when generated tasks/units exceed them.
4. Update readiness assessment to require accepted scopes for scheduler-ready and add a guardrail explaining blocked expansion.
5. Update rendering/projection copy only where needed so the user sees scope honesty without internal scheduler jargon.
6. Run targeted suites, then required checks and Harness checks.

## Decisions

- Scope honesty belongs in existing planning/readiness owners, not a new evidence family.
- SchedulerContract compiler remains a backstop; readiness should block earlier so Workbench does not show an unsafe scheduler gate.
- Tests/index/docs outside a constrained source scope are treated as expansion unless explicitly accepted in planning metadata.

## Minimality Gate Plan

- Can this be a no-op: no; current handoff identifies scope honesty as the next product blocker before wider scheduler automation.
- Reuse: existing planning bundle, DecompositionPlan, DecompositionReadinessManifest, SchedulerContract checks, read-model confirmation queue, and automation allowlist tests.
- Shared root fix: fix builder/readiness source truth rather than adding UI-only guards.
- Avoided: no new scheduler executor, workflow runtime, evidence family, permission system, or projection framework.
- Smallest coherent change: artifact metadata + readiness guardrail + focused projection/test coverage.

## Module Boundary Plan

- Owner module: `src/workbench/planning/builders.ts` for deterministic planning/readiness construction; `src/workflow-artifacts/*` for artifact schema/types.
- New / moved responsibilities: no new owner; scope honesty remains part of planning/readiness guardrails.
- Facade touch points: Workbench manager/action facades remain unchanged unless type exports require it.
- Forbidden write-back locations: no main logic in `App.tsx`, broad Workbench facades, or scheduler runtime.
- Compatibility surface: existing action ids and route shapes stay unchanged; artifact schema is additive.
- Boundary tests: planning scheduler prep, Workbench read-model/DOM, automation policy.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: typed planning artifacts, readiness guardrails, scheduler compiler source-scope checks, confirmation queue projection.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: planning/readiness builder.
- Shared cross-cutting logic location: workflow artifact schema/type validation.
- Local framework / state machine / projection / validation / gate avoided: avoided all; only strengthened existing guardrails.
- Future-cost reduction for similar features: future scheduler/Goal Loop steps can trust readiness to distinguish accepted scopes from unresolved expansions.

## Planning-Discovered Gaps

None.

