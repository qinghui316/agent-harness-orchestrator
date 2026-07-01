# Plan: main-agent-old-seam-retirement-v1

## Approach

Use inventory-backed cleanup. First classify each seam by current behavior, then
only change safe labels and tests. Do not remove live compatibility or boundary
surfaces in V1.

## Steps

1. Record seam inventory in this plan.
2. Update safe user-visible labels from "role pipeline" to main-agent execution
   language while keeping action ids and DTO fields stable.
3. Strengthen module-boundary tests so retired production entrypoints remain
   absent and live seams are explicitly retained.
4. Run targeted Workbench/module-boundary tests and standard verification.
5. Update review/summary and close the change.

## Decisions

- `runCodeValidateAuditSequence`, `runTaskQueueSequence`, and
  `task-queue-runner`: dead production entrypoints. Keep negative tests; do not
  edit archive history.
- `role.pipeline.*`: live-compat action ids. Keep in V1; only labels may change.
- `rolePipeline`: live-boundary read model. Keep in V1 because confirmation
  suppression, decision inspector, Agent graph, and Workpad details consume it.
- `MainAgentLoopProjection`: live-boundary non-executing Goal Loop seam. Keep in
  V1 and continue proving it is not a user confirmation surface.
- `rolePipeline: result` alias in demand-worker action result: inspect before
  editing; remove only if no consumer depends on it.

## Minimality Gate Plan

- Can this be a no-op: no; user-visible old terminology and seam inventory
  drift remain.
- Reuse: existing action ids, read model, projection, and boundary tests.
- Shared root fix: classify seams before changing code.
- Avoided: breaking action-id/DTO rename, deleting live safety surfaces, adding
  new architecture layers.
- Smallest coherent change: label cleanup plus boundary/inventory evidence.

## Module Boundary Plan

- Owner module: existing Workbench action/read-model owners and
  `tests/unit/workbench-module-boundaries.test.ts`.
- New / moved responsibilities: none.
- Facade touch points: `role.pipeline.*` labels only; no id rename.
- Forbidden write-back locations: Scheduler runtime, IntegrationCheck,
  confirmationQueue, action registry semantics, action revalidation, automation
  allowlist, apply/close.
- Compatibility surface: `role.pipeline.*`, `rolePipeline`, and
  `MainAgentLoopProjection` remain.
- Boundary tests: strengthen old-entrypoint absence and live-seam retention.
- Follow-up split candidates: V2 action-id/DTO alias migration if desired.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: main-agent orchestration,
  Workbench read model, action labels, module-boundary tests.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed.
- Domain-specific logic location: Workbench label formatting and read-model
  boundary tests.
- Shared cross-cutting logic location: `docs/BOUNDARIES.md` and existing ECL
  module-boundary rules.
- Local framework / state machine / projection / validation / gate avoided: no
  new framework or projection.
- Future-cost reduction for similar features: future agents can see which seams
  are intentionally retained and which are dead.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

Subagent review found that the first plan was too aggressive. V1 must not delete
`role.pipeline.*`, `rolePipeline`, or `MainAgentLoopProjection`; it should
instead classify them and only perform safe cleanup.

