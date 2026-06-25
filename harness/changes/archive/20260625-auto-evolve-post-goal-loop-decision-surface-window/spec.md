# Spec: auto-evolve-post-goal-loop-decision-surface-window

## Goal

Handle the pending Harness evolution generated after five archived changes
ending with `workbench-goal-loop-decision-surface-audit-v1`.

The change must decide whether the archive window justifies a durable Harness
rule, review-template update, lint rule, documentation merge, or no-op, then
record the result and clear the pending evolution state.

## Users

- Future AHO agents that rely on compact current handoff docs.
- Maintainers who need Harness evolution to preserve useful lessons without
  growing redundant rules or product abstractions.

## Acceptance Criteria

- AC-001: Read the pending window and current ECL/Harness rules before deciding.
- AC-002: Produce an evolution proposal with an Experience Retention Scan.
- AC-003: Use the user-authorized subagent for independent review/scoring.
- AC-004: Apply only the smallest justified durable delta; no product runtime
  changes are allowed.
- AC-005: Record one terminal evolution result and run
  `harness-evolve mark-complete`.
- AC-006: Align handoff docs with no active change, no pending evolution, and
  the latest completed evolution after close.
- AC-007: Run Harness verification and close the structured change.

## Non-Goals

- Product runtime behavior changes.
- New ECL sections, templates, lint rules, or review fields unless the archive
  window proves an uncovered durable rule.
- Copying E-drive sandbox details, run ids, or archive closeout history into
  current handoff docs.
- Full-auto, scheduler loop, parallel executor, automatic apply/close/merge, or
  any workflow permission change.

## Constraints

- `harness/evolution/pending.md` is a reminder, not workflow truth.
- Independent review is required for a non-dry-run evolution result.
- Current docs must stay compact and archive details must stay archive-only.
- `README.md` remains unrelated and untracked.

## Risks

- Adding another rule after the minimality gate would increase Harness
  complexity without improving behavior.
- Treating product-specific restore or scope-honesty bugs as generic Harness
  rules would create future process noise.
- Failing to clear pending evolution would leave future agents blocked on stale
  current-state signals.

