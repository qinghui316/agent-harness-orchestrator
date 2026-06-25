# Plan: document-minimality-gate-and-complexity-review

## Approach

Add the smallest durable rule surface that changes future agent behavior:
entry guidance in `AGENTS.md`, reusable process rule in `docs/ECL.md`, and
template prompts where future plans/reviews are written. Keep the new review
section short so it prevents bloat without becoming bloat itself.

## Steps

1. Update active change files with concrete acceptance and closeout scope.
2. Add compact minimality guidance to current docs.
3. Add short template fields for plan and review.
4. Run Harness/documentation checks and drift greps.
5. Close and archive the change, then commit.

## Decisions

- Complexity review is a supplemental short block, not a replacement for
  correctness, boundary, security, source safety, or validation review.
- `net` is qualitative by default. Use `Lean already.` when there is no obvious
  deletion or shrink opportunity.
- Ponytail remains reference evidence only; no dependency or vendored content.

## Minimality Gate Plan

- Can this be a no-op: no; current templates do not force a minimality check.
- Reuse: extend existing ECL, AGENTS, current-plan, and change templates.
- Shared root fix: add the rule where future structured changes are planned and
  reviewed instead of relying on one-off user reminders.
- Avoided: no new product runtime, no new linter, no new review mega-template,
  no Ponytail dependency.
- Smallest coherent change: docs/template additions only.

## Module Boundary Plan

- Owner module: Harness docs/templates.
- New / moved responsibilities: lightweight minimality guidance and review
  prompt live in ECL and change templates.
- Facade touch points: not applicable.
- Forbidden write-back locations: product runtime and Workbench feature code.
- Compatibility surface: existing change lifecycle and review template remain
  compatible; only additive sections are introduced.
- Boundary tests: Harness lint and drift greps.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: ECL structured change planning,
  Harness review template, documentation entropy rules, and architecture growth
  control.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: `docs/ECL.md` and Harness templates.
- Local framework / state machine / projection / validation / gate avoided: no
  product/runtime mechanism is added.
- Future-cost reduction for similar features: future changes must explicitly
  evaluate delete/reuse/shrink paths before adding new layers.

## Planning-Discovered Gaps

None yet.

