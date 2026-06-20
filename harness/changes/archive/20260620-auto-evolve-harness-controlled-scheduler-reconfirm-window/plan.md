# Plan: auto-evolve-harness-controlled-scheduler-reconfirm-window

## Approach

Treat the pending evolution as a Harness evaluation artifact, not a product
implementation phase. Review the five candidate archives, compare observed
review/validation issues against existing ECL coverage, and only modify Harness
files if a repeated missing-policy gap is identified.

## Steps

1. Read `harness/evolution/pending.md` and the five candidate archive
   summaries.
2. Write a proposal under `harness/evolution/proposals/`.
3. Ask a subagent to independently evaluate whether a Harness change is
   required.
4. Apply the narrow review-template alignment if independent review identifies
   a missing template section for an existing ECL rule.
5. Record review/summary/tasks with the final keep/change decision and
   validation evidence.
6. Run `harness-evolve.ps1 mark-complete`, reindex, verify no pending
   evolution remains, then close the ECL change.

## Decisions

- Candidate window: controlled scheduler post-step evaluation, visible
  readiness handoff, stop handoff, workflow result summary thread visibility,
  and controlled scheduler reconfirm copy.
- Decision after independent review: `template_update / independent_review`.
  Existing ECL already contains Transcript Renderer Source-Boundary Coverage,
  but the default review template lacked the matching section.
- No product runtime, Harness rule, script, or lint change.

## Module Boundary Plan

- Owner module: Harness evolution ledger under `harness/evolution/` and active
  ECL change files.
- New / moved responsibilities: none planned.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench frontend/backend
  behavior, Harness scripts/rules unless a real gap appears.
- Compatibility surface: no runtime or API compatibility impact.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: pending evolution flow, proposal
  ledger, independent review, review template, results.tsv, mark-complete
  state.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: proposal/review text only.
- Shared cross-cutting logic location: existing ECL rule and default review
  template coverage.
- Local framework / state machine / projection / validation / gate avoided: no
  new evolution framework or lint rule by default.
- Future-cost reduction for similar features: future transcript-affecting
  changes receive the existing ECL source-boundary prompt in their default
  review file.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Candidate summaries show repeated attention to controlled scheduler honesty,
  post-step re-evaluation, result visibility, and real UI validation.
  Independent review found a narrow template gap: ECL already has Transcript
  Renderer Source-Boundary Coverage, but the review template did not.
