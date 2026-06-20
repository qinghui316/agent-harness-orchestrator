# Plan: auto-evolve-harness-controlled-scheduler-routing-window-noop

## Approach

Treat the pending evolution as a bounded controlled-evolution closeout. The candidate archives show repeated controlled Scheduler UI/read-model surfaces and already include real App DOM validation where behavior was visible. The previous Harness evolution already promoted this exact lesson into ECL and the review template, so this change records a noop result rather than duplicating rules.

## Steps

1. Review `harness/evolution/pending.md` and the five candidate archive summaries.
2. Compare the candidate lessons with current `docs/ECL.md` Workbench User-Surface Honesty and the review template.
3. Use a subagent for independent evolution evaluation.
4. Create a proposal documenting the noop rationale and Experience Lifecycle scan.
5. Update handoff docs for the active evolution and, after close, for no-active/product-resume state.
6. Run Harness validation, record `mark-complete`, verify pending evolution is cleared, then close/git.

## Decisions

- Independent evaluation recommends `noop`: existing ECL and review-template language already requires real App DOM/browser UI verification when Workbench behavior is product-visible.
- No ECL/template/doc-rule update will be made in this change unless validation discovers a concrete current-rule gap.
- Product code/tests are not touched by this evolution.

## Module Boundary Plan

- Owner module: not applicable for product code; controlled evolution artifacts live under `harness/evolution/` and active ECL change files.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: no product runtime, frontend, scheduler, Goal Loop, ToolPolicy, source apply, or manager facade changes.
- Compatibility surface: existing Harness evolution script contract and review template remain unchanged.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module responsibility is added or changed.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Controlled Evolution, Workbench User-Surface Honesty, Experience Lifecycle, Documentation Entropy, review-template closeout fields, and `harness-evolve.ps1 mark-complete`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: existing ECL/review-template coverage remains the shared policy.
- Local framework / state machine / projection / validation / gate avoided: avoids adding a duplicate UI-validation rule or a second evolution policy.
- Future-cost reduction for similar features: future agents can rely on the already-promoted rule and template fields instead of reading repeated phase-specific prose.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent `019ee542-e471-7171-a4d6-d3b7a86a0ac5` recommends `noop`; the main remaining work is formal ECL/proposal/results/handoff closeout.

