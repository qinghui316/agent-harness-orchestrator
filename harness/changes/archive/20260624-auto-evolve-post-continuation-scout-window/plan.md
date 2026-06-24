# Plan: auto-evolve-post-continuation-scout-window

## Approach

Treat the pending window as a bounded semantic maintenance review. The main
agent evaluates the candidate archives against existing ECL rules and templates,
then records a proposal. A user-authorized subagent performs independent
read-only scoring. Apply only a narrow durable Harness delta if both archive
evidence and independent review show that existing rules are insufficient;
otherwise record a `noop` result and clear the pending state.

Current evidence suggests a likely `noop`: the recent archives reinforce
already-promoted rules for Workbench user-surface honesty, real acceptance
isolation, split Workbench verification evidence, bounded Goal Loop authority,
and documentation entropy. The new real UI continuation scout produced concrete
product fixes, but those fixes are implementation details rather than new
process rules.

## Steps

1. Confirm no active product change and read pending archive summaries.
2. Write an auto-evolve proposal with accepted/rejected candidates and
   Experience Retention Scan.
3. Record independent subagent review and final keep/noop decision.
4. If needed, make the smallest Harness rule/template edit; otherwise keep the
   proposal as no-op evidence.
5. Run Harness verification.
6. Append the evolution result via `scripts/harness-evolve.ps1 mark-complete`.
7. Update `AGENTS.md`, `docs/STATUS.md`, and
   `docs/CURRENT-DEVELOPMENT-PLAN.md` for post-evolution handoff.
8. Close the active change and regenerate the index.

## Decisions

- Use `noop` unless independent review identifies a concrete missing durable
  rule not already covered by ECL or the review template.
- Do not promote external sandbox names, exact run ids, or Workbench test timing
  chronology into current docs.
- Treat the `.agent-harness/workbench/` ignore and BOM parser fixes as product
  implementation evidence, not Harness process rules.
- Keep broader scoped full-auto / Goal-driven loop authorization as the next
  product direction after pending evolution is complete.

## Module Boundary Plan

- Owner module: not applicable; no product module is changed.
- New / moved responsibilities: not applicable.
- Facade touch points: not applicable.
- Forbidden write-back locations: product runtime/source files are out of
  scope for this Harness evolution.
- Compatibility surface: ECL lifecycle, evolution proposal records, and handoff
  docs remain compatible.
- Boundary tests: Harness lint/status checks.
- Follow-up split candidates: none.
- If not applicable, reason: this change evaluates Harness memory and does not
  add Workbench action execution, projections, runtime services, frontend
  panels, typed workflow artifacts, or cross-module workflow state.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `docs/ECL.md` Controlled
  Evolution, Documentation Entropy, Experience Lifecycle, Workbench
  User-Surface Honesty, Goal Loop Boundary, and review-template coverage.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  insufficiency has been found yet.
- Domain-specific logic location: product-specific details remain in archived
  summaries and tests.
- Shared cross-cutting logic location: if needed, ECL/review-template wording,
  not product code.
- Local framework / state machine / projection / validation / gate avoided: no
  new evolution machinery or product-layer framework.
- Future-cost reduction for similar features: clearing pending evolution with a
  documented no-op prevents repeated agents from re-processing the same window.

## Planning-Discovered Gaps

None currently. Final decision waits for independent subagent review.
