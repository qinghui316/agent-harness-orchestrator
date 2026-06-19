# Spec: Auto-evolve Harness Helper Reuse Window

## Goal

Resolve the pending Harness evolution trigger from the helper-reuse archive
window without growing current docs unless the evidence proves a new durable rule
is needed.

## Users

- Future AHO agents relying on current Harness rules.
- Maintainers reviewing whether repeated helper-reuse evidence should change
  process memory.

## Acceptance Criteria

- AC-001: The pending helper-reuse archive window is evaluated with independent
  review and an explicit Experience Retention Scan.
- AC-002: A proposal records the `keep` decision and explains why no new
  ECL/template/lint/product runtime change is needed.
- AC-003: Stale active/pending handoff is corrected while the auto-evolve change
  is active and after close.
- AC-004: `harness-evolve mark-complete` appends a results row, removes
  `pending.md`, updates evolution state, and validation passes.

## Non-Goals

- Do not change product runtime behavior or source code semantics.
- Do not add new Harness rules, templates, or lint checks.
- Do not edit reference projects or `README.md`.

## Constraints

- Pending Harness evolution must be handled through proposal, independent
  review, validation, results logging, `mark-complete`, and ECL close.
- Current docs should stay compact; detailed helper-reuse implementation history
  remains archive-only.
- Human gates, ToolPolicyGate, workflow truth, and product boundaries remain
  unchanged.

## Risks

- Marking `keep` too early could miss a real process gap. Mitigated by the
  independent review and explicit Experience Retention Scan.
- Adding another narrow rule could worsen documentation entropy. Mitigated by
  keeping implementation details archive-only when existing rules are sufficient.
