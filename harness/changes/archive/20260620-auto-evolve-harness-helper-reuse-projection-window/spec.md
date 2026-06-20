# Spec: auto-evolve-harness-helper-reuse-projection-window

## Goal

Handle pending Harness evolution for the latest five helper/projection reuse archives by producing proposal, independent review, validation, results row, and completion evidence.

## Users

- Future agents relying on current Harness rules and compact handoff docs.
- Maintainers using auto-evolve evidence to prevent repeated process drift and documentation bloat.

## Acceptance Criteria

- AC-001: Evolution proposal reviews all five candidate archives and records a concrete `keep / independent_review` or stronger justified decision.
- AC-002: Proposal includes an Experience Retention Scan with Promote, Retain, Merge, Retire, and Archive-only decisions.
- AC-003: Independent subagent review is recorded and supports the chosen result or required revisions are applied first.
- AC-004: `harness-evolve.ps1 mark-complete` records a results row, updates evolution state, and removes `harness/evolution/pending.md`.
- AC-005: Handoff docs no longer point at stale active product changes or pending evolution after completion, and latest Harness evolution points at this archived auto-evolve change after close.
- AC-006: `docs/STATUS.md` archive lookup no longer labels older scheduler runtime product archives as `Latest product` when the current top-level latest product is maintenance confirmation helper reuse.
- AC-007: No new Harness rule/template/lint/product runtime change is made unless the proposal and independent review identify a current uncovered repeated lesson.

## Non-Goals

- Do not add product source behavior.
- Do not add new ECL or template rules when existing rules already cover the evidence.
- Do not copy candidate archive implementation details into current docs.
- Do not rewrite the full archive lookup ledger.

## Constraints

- Pending evolution must finish with proposal, independent review, validation, results row, and `mark-complete`.
- Current docs must remain compact derived memory.
- Candidate helper/action names and field-level implementation details should stay archive-only unless they change future agent decisions.

## Risks

- Creating another duplicated Harness rule would worsen documentation entropy.
- Failing to clean up pending/active/latest handoff fields would leave future agents planning from stale state.
