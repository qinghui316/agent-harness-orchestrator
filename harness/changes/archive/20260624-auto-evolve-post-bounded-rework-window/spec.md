# Spec: auto-evolve-post-bounded-rework-window

## Goal

Resolve `harness/evolution/pending.md` for the post-bounded-rework archive
window through the required ECL evolution process: proposal, independent review,
validation, result logging, mark-complete, close, and git settlement.

## Users

- Future AHO agents that rely on compact current handoff docs and durable ECL
  rules instead of archive archaeology.
- The project owner, who needs Harness evolution to improve only when repeated
  evidence warrants it and to avoid documentation/code sprawl.

## Acceptance Criteria

- AC-001: The proposal evaluates all five pending candidate archives and
  records an Experience Retention Scan with Promote, Retain, Merge, Retire, or
  Archive-only decisions.
- AC-002: A user-authorized subagent performs independent read-only review and
  scoring, and its verdict is recorded in the active review/proposal.
- AC-003: Any recommended durable change is either implemented and validated, or
  explicitly rejected as covered by existing ECL/template/lint/docs/product
  boundaries.
- AC-004: `harness/evolution/results.tsv` and `harness/evolution/state.json`
  are updated only through `scripts/harness-evolve.ps1 mark-complete`, and
  `harness/evolution/pending.md` is cleared.
- AC-005: Handoff docs align on no active change, no pending evolution, latest
  archive/evolution pointers, and do not promote detailed run history into
  current docs.
- AC-006: Harness verification passes after reindex/status/evolution closeout.

## Non-Goals

- Product runtime behavior changes.
- New Workbench automation permissions or UI behavior.
- Automatic source apply, close/archive, merge, push, remote landing, or Harness
  evolution apply.
- New Scheduler loop, parallel executor, slot allocator, or child Change
  creation.
- Handwriting generated indexes or bypassing Harness scripts.

## Constraints

- `AGENTS.md` remains a compact map; detailed sandbox/run history stays in
  archive summaries.
- `docs/STATUS.md` remains a short handoff, not an archive ledger.
- If no durable rule/template/lint delta is justified, a `noop` evolution is
  valid only after explicit Experience Lifecycle classification.
- `README.md` remains unrelated and untracked.

## Risks

- Over-promoting a one-window product implementation detail would create
  process/code sprawl.
- Under-recording the scan would make `noop` look like skipped maintenance.
- Manual edits to generated indexes or pending state could corrupt Harness
  lifecycle accounting.
