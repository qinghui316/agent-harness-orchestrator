# Plan: workbench-close-gate-projection-alignment

## Approach

Repair the read-model source of the mismatch. The confirmation queue already
promotes selected-demand close gates. The decision inspector should use the
same close-ready evidence to make the close gate its selected-demand primary
context when present, while keeping stale result/failure contexts related or
historical.

## Steps

1. Record this structured product change and handoff active pointers.
2. Add focused read-model regression coverage for close gate winning over stale
   result/failure contexts.
3. Add focused DOM coverage for the right pane visible primary card.
4. Update `src/workbench/projections/read-model/decision-inspector.ts` in the
   existing read-model owner. Prefer a small prioritization helper over new
   state or a feature-local framework.
5. If needed, adjust frontend projection selection without changing action
   authority.
6. Run targeted Workbench tests, product checks, and Harness checks.
7. Update review/summary and close the change.

## Decisions

- Owner: Workbench read-model projection, specifically the decision inspector
  builder.
- UI authority: `confirmationQueue.primary` remains the executable source for
  the right-side card.
- API consistency: `decisionInspector.primary` must also reflect close gate
  when close is the current selected-demand decision.
- Stale failures: keep as evidence/history/related; do not delete evidence.

## Module Boundary Plan

- Owner module: Workbench read-model projection.
- New / moved responsibilities: none; this is a prioritization correction.
- Facade touch points: avoid adding main logic to `implementation.ts` or
  frontend shell code unless a thin compatibility adjustment is required.
- Forbidden write-back locations: workflow runtime, apply/close services,
  scheduler runtime, Goal Loop, and Codex runtime.
- Compatibility surface: Workbench snapshot shape and action payloads remain
  unchanged.
- Boundary tests: `workbench-read-model.test.ts` and `web-app.test.tsx`.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: approval inbox close-gate
  evidence, decision inspector contexts, confirmation queue primary selection,
  scoped action payloads, and Workbench DOM tests.
- New cross-cutting mechanism: none.
- Local framework avoided: no new projection store, no new gate type, no new UI
  card family.
- Future-cost reduction: close-ready snapshots become consistent evidence for
  later manual-loop and Goal-driven Workflow Loop work.

## Planning-Discovered Gaps

The archived acceptance suggests the close gate exists in confirmation queue
while `decisionInspector.primary` can still prefer stale failure/result
contexts. The implementation should prove this with a regression test before
or alongside the fix.
