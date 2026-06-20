# Spec: auto-evolve-harness-workbench-target-helper-verification-window

## Goal

Evaluate the pending Harness evolution window created after five archived changes, covering maintenance Markdown helper reuse, verification-scope guidance alignment, and Workbench action target helper reuse.

Determine whether the observed lessons require new Harness rules/templates/lint checks or should be retained under existing ECL guidance.

## Users

- Future agents continuing Architecture Growth Control / Core Mechanism Reuse.
- Maintainers relying on targeted verification and Workbench action target helper ownership.

## Acceptance Criteria

- AC-001: Produce an evolution proposal for the pending window.
- AC-002: Record independent review result for the proposal.
- AC-003: If no durable rule change is required, record `keep / independent_review` and complete Harness evolution with `scripts/harness-evolve.ps1 mark-complete`.
- AC-004: Update handoff pointers before/after close without promoting archive detail into current docs.

## Non-Goals

- Do not change `docs/ECL.md`, Harness templates, lint scripts, product runtime, Workbench behavior, scheduler behavior, Goal Loop behavior, ToolPolicyGate, or human gates unless the review finds a real rule gap.
- Do not reopen or modify the archived product changes.
- Do not add helper-specific implementation examples to current docs.
- Do not include unrelated untracked `README.md`.

## Constraints

- Pending evolution must be processed through ECL with proposal, independent review, validation evidence, `results.tsv`, and `mark-complete`.
- Documentation entropy rules apply: current docs should carry only decision-changing handoff pointers.
- Existing Architecture Growth Control, Module Boundary, targeted verification, and close/handoff drift rules should be reused before proposing new Harness rules.

## Risks

- Adding another rule for already-covered helper reuse or verification-scope lessons would increase Harness document noise.
- Failing to update handoff pointers after close would leave stale active/pending state.

