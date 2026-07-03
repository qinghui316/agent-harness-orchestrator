# Plan: auto-evolve-post-real-a2a-conversation-delete-window

## Approach

Treat this as a Harness evolution closeout, not a product change. Review the
candidate archive window, record the proposal and subagent review, mark
evolution complete, and align handoff docs.

## Steps

1. Read `harness/evolution/pending.md`, candidate summaries, `docs/ECL.md`, and
   relevant handoff docs.
2. Ask an authorized subagent for independent boundary review.
3. Write the evolution proposal with the selected result.
4. Update active change review/summary/tasks with proposal, review, and
   validation evidence.
5. Run `harness-evolve mark-complete`.
6. Repair `AGENTS.md` / `docs/STATUS.md` pending-state drift.
7. Run Harness checks, close the change, and commit.

## Decisions

- Result type: `docs_current_delta`.
- Reason: existing ECL/BOUNDARIES and recent product docs already cover the
  lessons; only current handoff state needs repair.
- No product tests are required because no product code changes.

## Minimality Gate Plan

- Can this be a no-op: not entirely; pending evolution requires proposal,
  review, results row, and `mark-complete`.
- Reuse: existing `harness-evolve.ps1`, `harness-change.ps1`, ECL review
  sections, and handoff docs.
- Shared root fix: current drift is pending-state wording, so fix handoff
  wording rather than adding new runtime or lint behavior.
- Avoided: no new evolution framework, no new Workbench UI/runtime change, no
  new rule/template/lint without evidence.
- Smallest coherent change: proposal + review + results row + handoff cleanup.

## Module Boundary Plan

- Owner module: not applicable; no product module changes.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime, Workbench UI, action
  handlers, confirmationQueue, automation allowlist, Scheduler,
  IntegrationCheck, apply/close owners.
- Compatibility surface: existing Harness evolution scripts.
- Boundary tests: Harness lint/reindex/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: this change does not add or modify product
  modules.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: controlled evolution lifecycle,
  proposal evidence, subagent review, results.tsv, status handoff, and Harness
  checks.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: archive-specific lessons stay in archive
  summaries and proposal.
- Shared cross-cutting logic location: existing ECL/BOUNDARIES coverage.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: keeps evolution windows small and
  prevents product lessons from becoming new rules without repeated evidence.
- If not applicable, reason: not applicable beyond this reuse record.

## Planning-Discovered Gaps

Subagent Socrates found one required handoff repair: `docs/STATUS.md` currently
mentions pending evolution at the top but later says pending evolution is none.
Repair this after `mark-complete`.
