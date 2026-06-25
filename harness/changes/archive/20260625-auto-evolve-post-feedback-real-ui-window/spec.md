# Spec: auto-evolve-post-feedback-real-ui-window

## Goal

Evaluate the pending Harness evolution window after `workbench-confirmation-feedback-real-ui-scout-v1` and apply only the smallest evidence-backed Harness or handoff delta.

## Users

- Future AHO agents loading current context.
- The project owner, who wants Harness self-improvement without documentation bloat or accidental product-runtime changes.

## Acceptance Criteria

- AC-001: The five candidate archive summaries are reviewed against ECL controlled-evolution, documentation-entropy, and experience-lifecycle rules.
- AC-002: An evolution proposal records recommendation, evidence summary, independent review scope, and Promote / Retain / Merge / Retire / Archive-only decisions.
- AC-003: Authorized subagent review is recorded with recommendation, score, and limitations.
- AC-004: If no durable rule/template/lint/runtime gap is found, no such change is made.
- AC-005: Handoff docs and evolution state agree on active/pending state before close and no-active/no-pending state after close.
- AC-006: `harness/evolution/results.tsv`, `state.json`, `pending.md`, and `harness/changes/INDEX.json` are updated only through the Harness scripts or append-only results contract.

## Non-Goals

- Product runtime or Workbench behavior changes.
- New ECL rule, review-template field, or lint rule unless the evidence proves a repeated uncaptured gap.
- Automatic Harness evolution application by `完全访问权限`.
- Copying detailed sandbox/run history into current handoff docs.

## Constraints

- `pending.md` is a maintenance reminder, not workflow truth or a hard lock.
- Subagent can review/score only; it must not own ECL lifecycle or edit canonical docs/source.
- Current docs must stay compact; archives and `INDEX.json` own detailed history.
- `README.md` remains unrelated and untracked.

## Risks

- Documentation bloat if detailed real UI evidence is copied into current docs.
- False process growth if a one-off product bug is promoted into a permanent rule despite existing coverage.
- Handoff drift if active/pending state is not updated before and after close.
