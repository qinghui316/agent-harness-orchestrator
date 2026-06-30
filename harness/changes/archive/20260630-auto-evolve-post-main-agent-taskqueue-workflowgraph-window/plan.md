# Plan: auto-evolve-post-main-agent-taskqueue-workflowgraph-window

## Approach

Review the five candidate archives as an experience-retention window. Compare
their retained lessons against existing ECL and architecture documents. If
coverage is already durable and general, close as `noop`; if a missing durable
rule is found, propose the smallest rule or template change.

## Steps

1. Read `harness/evolution/pending.md` and the candidate archive summaries.
2. Check current durable rules in `docs/ECL.md`, `docs/BOUNDARIES.md`,
   `docs/AGENT-MODEL.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
3. Record local proposal and independent subagent review.
4. If no durable gap is found, run `scripts/harness-evolve.ps1 mark-complete`
   with `noop / subagent_review`.
5. Run Harness checks and close the evolution change.

## Working Decision

No-op is currently preferred. The candidate archives reinforce existing durable
rules:

- Main-agent / Goal Loop evidence is not workflow truth.
- Proposal/runtime boundaries must fail closed and not execute by themselves.
- Module owners should retire old facades without creating duplicate truth.
- Documentation entropy should keep implementation details archive-only.
- Harness evolution requires proposal, review, validation, and explicit
  results logging.

## Minimality Gate Plan

- Can this be a no-op: yes, unless independent review finds a missing durable
  rule.
- Reuse: existing ECL and boundary docs cover the retained lessons.
- Shared root fix: avoid adding per-archive rules for one migration window.
- Avoided: no product code, UI, template, or runtime changes.
- Smallest coherent change: mark pending evolution complete with review
  evidence.
