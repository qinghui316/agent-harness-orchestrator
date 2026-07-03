# Spec: auto-evolve-post-real-a2a-conversation-delete-window

## Goal

Handle the pending Harness evolution window generated after five archived
changes and decide whether the accumulated experience requires a Harness
rule/template/lint/CI/runtime update or only current-handoff closeout.

## Users

- Future agents relying on ECL and handoff docs to decide whether A2A UI,
  child-agent projection, LLM advice, and conversation delete lessons are
  already covered by current rules.
- Maintainers who need `harness/evolution/pending.md` cleared only after
  proposal, independent review, validation, and `results.tsv` evidence exist.

## Acceptance Criteria

- AC-001: The five candidate archives in `harness/evolution/pending.md` are
  reviewed against existing ECL/BOUNDARIES/template/lint/runtime coverage.
- AC-002: A proposal under `harness/evolution/proposals/` records the selected
  evolution result and why.
- AC-003: Independent subagent review is recorded with recommendation,
  required edits, risks, and limitations.
- AC-004: `harness-evolve mark-complete` writes a `results.tsv` row and removes
  `harness/evolution/pending.md`.
- AC-005: Current handoff docs no longer contradict pending evolution state.
- AC-006: Harness checks pass after reindex.

## Non-Goals

- No product runtime or Workbench UI implementation.
- No new Harness rule, template, script, lint, CI, or runtime authority unless
  archive evidence proves current coverage is insufficient.
- No rewrite of archived product history.

## Constraints

- Follow `docs/ECL.md` controlled evolution requirements: proposal,
  independent review, validation, results row, and `mark-complete`.
- Subagent review is advisory only; the main agent still owns lifecycle,
  validation, and closeout.
- Do not include unrelated untracked `README.md`.

## Risks

- A2A / child-agent UI acceptance could be mistaken for workflow authority.
  Existing transcript, proposal/runtime, Goal Loop, and user-surface honesty
  coverage must remain the boundary.
- Conversation deletion could be mistaken for Change deletion. Existing
  Workbench/RUNTIME/BOUNDARIES docs must keep transcript deletion separate from
  Change/evidence/source state.
- Handoff docs are long; only repair contradictory current state in this
  evolution window rather than rewriting archive ledgers.
