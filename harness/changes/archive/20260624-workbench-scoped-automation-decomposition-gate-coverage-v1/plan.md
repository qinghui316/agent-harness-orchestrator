# Plan: workbench-scoped-automation-decomposition-gate-coverage-v1

## Approach

Make the smallest product-code change that turns the proven scoped automation
V1 stop point into an implemented safe gate. Treat `planning.decompose` as a
local proposal-generation workflow action that can run under scoped automation
only after it is visible as the current primary confirmation and revalidated
against the selected Change.

## Steps

1. Add `planning.decompose` to scoped automation allowed action policy.
2. Add required-target and current-gate revalidation coverage for
   `planning.decompose`.
3. Update targeted tests for automation runtime, workflow action target
   validation, current action revalidation, Workbench read-model, and DOM
   payload behavior.
4. Run targeted and aggregate verification.
5. Run external-sandbox real UI acceptance for `完全访问权限` advancing past
   `planning.decompose`.
6. Update summary/review/handoff and close the change.

## Decisions

- `planning.decomposition.generate` is not a real action id in this codebase;
  use existing `planning.decompose`.
- `planning.generate` remains outside scoped automation because the user should
  see and review the planning draft before granting execution authorization.
- `planning.decompose` requires explicit selected Change scope and current
  primary gate matching; it must not fall back to global active state.

## Module Boundary Plan

- Owner module: existing `src/automation-runtime/` policy, existing workflow
  action registry, existing `src/workbench/actions/current-action-revalidation.ts`,
  and existing planning action handler.
- New / moved responsibilities: no new owner; strengthen existing scoped
  automation and revalidation owners.
- Facade touch points: handler index remains existing wiring only.
- Forbidden write-back locations: do not add main logic to `src/workbench/chat.ts`,
  `src/workbench/manager.ts`, `src/server/workbench-server.ts`, or
  `src/web/src/App.tsx`.
- Compatibility surface: no route/action id rename; `planning.decompose` remains
  the public action id.
- Boundary tests: workflow action target validation, action revalidation,
  automation runtime, Workbench read-model, and DOM payload tests.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation authorization,
  current-gate revalidation, workflow action required-target checks, strict
  scope matching, existing planning handler, and Workbench confirmation queue.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: `planning.decompose` remains in planning
  handler and Workbench typed workflow projection.
- Shared cross-cutting logic location: automation allow-list and workflow action
  revalidation.
- Local framework / state machine / projection / validation / gate avoided:
  avoid a new automation runner, permission layer, or decomposition-specific
  revalidation branch outside the shared action path.
- Future-cost reduction for similar features: later safe gate families can use
  the same allow-list plus shared revalidation pattern.

## Planning-Discovered Gaps

- The previous handoff wording used `planning.decomposition.generate`, but the
  implemented action id is `planning.decompose`. Current docs/review should use
  the real id when describing this follow-up.
