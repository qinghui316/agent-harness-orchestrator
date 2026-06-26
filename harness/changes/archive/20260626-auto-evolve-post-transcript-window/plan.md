# Plan: auto-evolve-post-transcript-window

## Approach

Handle the pending Harness evolution as a compact docs-merge/no-runtime
maintenance change. Review the candidate window, use the authorized subagent as
independent evidence, write a proposal, align current handoff state, mark the
evolution complete, and close.

## Steps

1. Read `pending.md` and the five candidate archive summaries.
2. Spawn an independent subagent review scoped to recommendation and score.
3. Write an evolution proposal with an Experience Retention Scan.
4. Apply only current-state handoff alignment justified by the window.
5. Run Harness verification and `harness-evolve mark-complete`.
6. Close/archive and git settle.

## Decisions

- Decision: `docs_merge`.
- No new ECL/template/lint/product runtime change is justified.
- Current-state docs need a small alignment pass because pending/latest state
  drifted after the transcript archive.

## Minimality Gate Plan

- Can this be a no-op: partially, but docs drift makes a no-op weaker than a
  small docs merge.
- Reuse: existing ECL evolution lifecycle, proposal file, review template,
  `results.tsv`, and `harness-evolve mark-complete`.
- Shared root fix: update the shared handoff pointers instead of adding new
  rules or per-change reminders.
- Avoided: no new Harness rule, template field, lint rule, product runtime,
  evidence family, or documentation ledger expansion.
- Smallest coherent change: proposal + compact handoff alignment + mark
  complete.

## Module Boundary Plan

- Owner module: not applicable; Harness/docs-only evolution.
- New / moved responsibilities: none.
- Facade touch points: not applicable.
- Forbidden write-back locations: no product source changes.
- Compatibility surface: existing Harness evolution scripts and docs remain
  compatible.
- Boundary tests: Harness lint/status/evolve checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module behavior changes.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: ECL controlled evolution,
  documentation entropy, experience lifecycle, generated index, and
  `harness-evolve` state/results.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed.
- Domain-specific logic location: archived summaries and evolution proposal.
- Shared cross-cutting logic location: existing ECL docs and evolution scripts.
- Local framework / state machine / projection / validation / gate avoided:
  avoided.
- Future-cost reduction for similar features: keeps pending evolution handling
  lightweight and avoids rule/template bloat.

## Planning-Discovered Gaps

None. The current ECL coverage already handles the repeated lessons.
