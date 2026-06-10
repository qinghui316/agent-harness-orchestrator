# Spec: Auto Evolve Harness Phase 8G 8K Boundary Evidence

## Goal

Resolve the pending Harness evolution reminder created after Phase 8K by
reviewing the Phase 8G-8K archive evidence and deciding whether the Harness
needs a new rule, template update, lint, or no change.

## Acceptance Criteria

- AC-001: The pending Phase 8G-8K archive window is reviewed against existing
  ECL and review-template coverage.
- AC-002: A user-authorized independent subagent review is recorded with scope,
  recommendation, score, and limitations.
- AC-003: A Harness evolution proposal records the final `noop` or `modify`
  decision and cites the evidence basis.
- AC-004: If `modify` is chosen, the change is limited to Harness docs,
  templates, or lint and does not touch product runtime code.
- AC-005: If `noop` is chosen, the proposal explains why existing rules are
  sufficient and names any follow-up product modularization separately.
- AC-006: `harness/evolution/results.tsv` and `state.json` are updated through
  `scripts/harness-evolve.ps1 mark-complete`, and `pending.md` is removed.
- AC-007: Handoff docs accurately record active/final evolution state, archive
  path, pending evolution state, and no stale active phase.
- AC-008: Harness lint, encoding lint, reindex, evolve check, and status checks
  pass after mark-complete and close-ready updates.

## Non-Goals

- Do not implement product code or continue module splitting in this change.
- Do not add scheduler, parallel execution, multi-Change automatic creation,
  ODWF runtime integration, or cache/replay.
- Do not edit `README.md`.

## Constraints

- `harness/evolution/pending.md` is a maintenance reminder, not a hard product
  lock; once handled, it must be resolved through recorded evidence and
  `mark-complete`.
- Subagent review is authorized for this change, but it is advisory. The main
  ECL lifecycle remains authoritative.
- Any Harness rule addition must be justified by repeated evidence across
  Phase 8G-8K, not by a single implementation preference.
