# Spec: Auto Evolve Harness Phase 12O-12S Product Maintenance Evidence

## Goal

Evaluate the pending Harness evolution window for Phase 12O through Phase 12S and decide whether any product-maintenance experience should be promoted into reusable Harness rules, templates, lint, tests, or current handoff documents.

## Users

- Future repository agents loading `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Maintainers relying on Harness evolution to retain useful experience without growing current docs into an archive ledger.

## Acceptance Criteria

- AC-001: Produce a Harness evolution proposal covering Phase 12O, 12P, 12Q, 12R, and 12S archive evidence.
- AC-002: Include an Experience Retention Scan with Promote, Retain, Merge, Retire, and Archive-only classifications.
- AC-003: Correct only current-state drift that affects future agent decisions, including post-Phase-12R/no-pending/future-application wording, without copying phase history into current docs.
- AC-004: Record independent review evidence for the evolution plan and close-ready result.
- AC-005: Append the `results.tsv` completion entry with `keep / independent_review`, run `mark-complete`, and remove `harness/evolution/pending.md`.
- AC-006: Verify Harness lint, encoding lint, active change status, evolution status, and targeted stale-current-state searches.

## Non-Goals

- Do not add new generic ECL rules, Harness templates, lint checks, or product runtime behavior unless the scan finds a concrete reusable gap.
- Do not rewrite stable memory, canonical docs, source code, apply/close gates, remote state, or runtime execution paths.
- Do not promote detailed Phase 12O-12S implementation history into `AGENTS.md` or `docs/STATUS.md`.
- Do not modify `README.md`.

## Constraints

- `harness/evolution/pending.md` is a maintenance reminder, not an automatic apply instruction.
- Harness evolution must remain ECL-governed: proposal, review, validation, results entry, and mark-complete.
- Current docs should contain only behavior-changing current state and routing guidance.
- Existing product-maintenance authority boundaries remain conservative and human-gated.

## Risks

- Current handoff drift can cause future agents to plan from post-Phase-12R state even though Phase 12S is archived.
- Over-promoting feature-specific lessons into generic ECL rules can bloat the Harness and make future work harder to route.
- Treating the patch application gate as an automatic canonical rewrite path would overstate current product capability.
