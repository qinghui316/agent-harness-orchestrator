# Plan: auto-evolve-post-codex-model-picker-window

## Approach

Use the pending archive window and independent subagent review to decide the
smallest durable Harness delta. The expected shape is a docs/template merge,
not product work: align stale current-state docs and tighten review-template
applicability for product-visible Workbench controls.

## Steps

1. Read pending evolution, current docs, ECL, reference map, and candidate
   archive summaries.
2. Collect independent subagent review and score.
3. Write an evolution proposal with decision and Experience Retention Scan.
4. Apply only minimal docs/template deltas backed by evidence.
5. Run Harness validation, mark pending evolution complete, close the active
   change, and commit the settlement.

## Decisions

- Decision: `docs_merge`.
- No new ECL rule: existing reference-driven UI/source evidence and
  user-surface honesty rules already cover fake controls and reference source
  evidence.
- Minimal review-template wording is justified because product-visible
  Workbench controls can mislead users even when they do not alter
  `confirmationQueue.primary`.

## Minimality Gate Plan

- Can this be a no-op: checked. A pure no-op would leave CURRENT stale and
  review-template applicability ambiguous for visible controls.
- Reuse: existing ECL reference-driven UI, Workbench user-surface honesty,
  runtime bridge, core-reuse, documentation entropy, and Experience Lifecycle
  rules are retained.
- Shared root fix: the root process gap is review applicability and handoff
  drift, so the shared template/current docs are adjusted instead of product
  paths.
- Avoided: new product runtime, lint rule, ECL section, reference tracking, or
  local process framework.
- Smallest coherent change: one template sentence plus current-state handoff
  alignment and evolution records.

## Module Boundary Plan

- Owner module: Harness docs/templates; no product owner touched.
- New / moved responsibilities: none.
- Facade touch points: not applicable.
- Forbidden write-back locations: product runtime, Workbench UI code, Codex
  bridge, reference source directories.
- Compatibility surface: existing change review template only.
- Boundary tests: Harness lint/evolution checks.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: ECL review template and current
  handoff docs.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: review template wording.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: future product-visible UI
  reviews have a clearer signal for DOM/browser evidence.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None.
