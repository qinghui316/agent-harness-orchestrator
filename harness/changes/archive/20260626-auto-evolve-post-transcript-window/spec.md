# Spec: auto-evolve-post-transcript-window

## Goal

Resolve the pending Harness evolution window generated after
`workbench-paged-virtual-transcript-with-pretext-v1`.

## Users

Future AHO agents that rely on compact current handoff docs, ECL rules, and
evolution results to choose the next safe development step.

## Acceptance Criteria

- AC-001: Review the five candidate archive summaries and produce an evolution
  proposal.
- AC-002: Record independent subagent review/score authorized by the user.
- AC-003: Decide whether to promote, retain, merge, retire, or leave
  archive-only each repeated lesson.
- AC-004: Apply only the smallest justified current-doc alignment; do not
  change ECL/templates/lint/product runtime without an uncovered repeated gap.
- AC-005: Record `results.tsv`, mark evolution complete, remove pending, and
  close/archive the structured change.

## Non-Goals

- No product runtime, Workbench, scheduler, transcript, automation, or
  IntegrationCheck changes.
- No new ECL rule, template field, or lint rule unless the window proves an
  uncovered repeated failure.
- No promotion of run ids, E-drive paths, ports, patch hashes, or gate
  sequences into current handoff docs.

## Constraints

- Harness evolution is human-gated; do not auto-apply rules from `pending.md`.
- Subagent review is advisory evidence only.
- Keep `AGENTS.md` and `docs/STATUS.md` compact maps, not archive ledgers.

## Risks

- Over-promoting a single transcript performance change into a durable rule.
- Leaving current-state drift between `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
