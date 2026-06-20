# Spec: auto-evolve-harness-workbench-helper-boundary-window

## Goal

Complete the pending Harness evolution lifecycle for the latest Workbench helper/boundary archive window while avoiding unnecessary new architecture rules or product-code changes.

## Users

- Future AHO agents relying on compact current handoff docs.
- Maintainers using Harness evolution to retain useful lessons without growing stale process memory.

## Acceptance Criteria

- AC-001: A proposal reviews all five candidate archives from `harness/evolution/pending.md`.
- AC-002: The proposal includes an Experience Retention Scan with Promote, Retain, Merge, Retire, and Archive-only decisions.
- AC-003: Independent subagent review is recorded and supports the chosen decision, or required revisions are applied first.
- AC-004: `harness-evolve.ps1 mark-complete` records a `keep / independent_review` results row, updates evolution state, and removes `harness/evolution/pending.md`.
- AC-005: `AGENTS.md` and `docs/STATUS.md` do not point at stale active product work after completion; final handoff states no active change, no pending evolution, latest product archive, and latest Harness evolution.
- AC-006: No product source or package script change is made.
- AC-007: No new Harness rule/template/lint/docs/product-runtime change is made unless the proposal and independent review identify a current uncovered repeated lesson.

## Non-Goals

- Do not add product runtime behavior.
- Do not extend Workbench, Scheduler, Goal Loop, ToolPolicyGate, source apply, remote handoff, or human-gate behavior.
- Do not create another standalone architecture/test convergence phase.
- Do not promote candidate archive implementation details into current docs.

## Constraints

- Pending evolution must finish with proposal, independent review, validation, results row, and `mark-complete`.
- Current docs are compact derived memory; archive summaries and `INDEX.json` own detailed history.
- User direction is product-function progress next, with architecture/test convergence only when it materially blocks or lowers risk for the product feature in front.

## Risks

- Adding another helper-specific process rule would worsen documentation entropy.
- Leaving stale active/pending handoff fields would make the next agent plan from false state.
- Over-scoping this evolution would delay product-function progress again.
