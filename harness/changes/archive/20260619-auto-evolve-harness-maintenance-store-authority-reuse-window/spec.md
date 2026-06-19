# Spec: auto-evolve-harness-maintenance-store-authority-reuse-window

## Goal

Resolve the pending Harness evolution triggered by five archived maintenance/core-reuse changes and determine whether the Harness needs a durable rule, template, lint, or documentation update.

## Users

- Future agents continuing AHO under ECL.
- Maintainers relying on Harness evolution to improve rules without inflating current docs.

## Acceptance Criteria

- AC-001: Review the five candidate archives named in `harness/evolution/pending.md`.
- AC-002: Produce an evolution proposal with an Experience Retention Scan.
- AC-003: Record independent review evidence and final decision.
- AC-004: If no durable Harness delta is warranted, record `keep / independent_review` and keep detailed examples archive-only.
- AC-005: Run validation, append a results row through `harness-evolve mark-complete`, remove pending evolution, and close with aligned handoff.

## Non-Goals

- Do not change Harness rules, templates, lint, or docs unless a concrete uncovered rule gap is found.
- Do not modify product source or reopen the closed product convergence change.
- Do not promote per-phase helper/store/authority examples into `AGENTS.md`, `docs/STATUS.md`, or `docs/ECL.md`.

## Constraints

- Pending evolution must follow proposal, independent review, validation, results logging, and mark-complete.
- Current docs should remain compact derived memory; archive summaries own detailed history.
- No automatic Harness evolution apply beyond the recorded `keep` result.

## Risks

- Promoting another narrow helper-specific rule would duplicate existing Core Mechanism Reuse guidance and increase documentation entropy.
- Failing to mark-complete would leave pending evolution and block final handoff.
