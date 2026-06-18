# Spec: Auto Evolve Harness Maintenance Canonical Chain Evidence

## Goal

Complete the pending Harness evolution pass for the maintenance canonical patch evidence window without growing current docs or rules unless evidence proves a durable gap.

## Users

- Future agents continuing AHO after product-maintenance canonical patch phases.
- Maintainers reviewing whether repeated source convergence evidence should become new Harness memory.

## Acceptance Criteria

- AC-001: The evolution proposal reviews the pending candidate archives and includes the later ledger-idempotency archive as additional observed evidence.
- AC-002: The proposal includes an Experience Retention Scan with explicit Promote, Retain, Merge, Retire, and Archive-only decisions.
- AC-003: Independent subagent review is recorded and either confirms no new durable rule is needed or names required corrections.
- AC-004: Harness validation passes, `results.tsv` records the evolution result, `pending.md` is cleared by `mark-complete`, and handoff docs do not drift.

## Non-Goals

- Do not create new ECL rules, templates, lint checks, or product runtime behavior unless the evidence review finds a concrete gap.
- Do not edit source code, Workbench behavior, canonical docs, stable memory, or reference projects.
- Do not promote archived phase narratives into current handoff docs.

## Constraints

- Pending evolution must be handled through proposal, independent review, validation, results logging, and `mark-complete`.
- Existing rules must be treated as reusable current memory when they already cover the evidence.
- If no durable change is needed, record why `keep` means retaining current rules as sufficient.

## Risks

- Adding another rule that repeats Architecture Growth Control would worsen documentation entropy.
- Marking the evolution complete without an explicit retention scan would allow append-only memory growth.
- Forgetting the ledger-idempotency archive would under-review the current evidence window.
