# Plan: auto-evolve-post-main-agent-llm-strategy-advice-window

## Approach

Treat this as Harness evolution closeout, not product work. Review the pending
archive window for recurring process gaps. If existing ECL/BOUNDARIES already
cover the lessons, record `docs_current_delta / subagent_review` and mark the
pending evolution complete.

## Steps

1. Read `harness/evolution/pending.md` and the candidate archive summaries.
2. Compare lessons against `docs/ECL.md`, `docs/BOUNDARIES.md`, `AGENTS.md`,
   and `docs/STATUS.md`.
3. Obtain independent subagent review.
4. If no durable gap exists, avoid rule/template/lint/runtime changes.
5. Run `harness-evolve mark-complete`, update handoff docs, run Harness checks,
   close, and commit with the product change.

## Decision

Preliminary decision: no new Harness rule/template/lint/runtime change. The
existing authority matrix already says LLM strategy advice is read-only
evidence, not truth/controller/gate/automation authority, and scoped
full-access remains constrained by current Harness gates and allowlists.
