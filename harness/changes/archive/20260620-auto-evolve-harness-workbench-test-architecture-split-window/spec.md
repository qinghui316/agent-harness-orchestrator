# Spec: Auto Evolve Harness Workbench Test Architecture Split Window

## Goal

Evaluate whether the five-change Workbench test architecture archive window requires a durable Harness/process improvement.

## Users

- Future agents continuing Workbench test architecture convergence.
- Maintainers relying on ECL/Harness evolution to retain repeated lessons without growing current docs unnecessarily.

## Acceptance Criteria

- AC-001: Candidate archives from `harness/evolution/pending.md` are reviewed as a coherent evidence window.
- AC-002: Proposal records an Experience Retention Scan with promote, retain, merge, retire, and archive-only decisions.
- AC-003: Independent review/subagent evaluates whether to apply a Harness/documentation delta or keep existing rules.
- AC-004: Validation includes Harness checks and records whether documentation entropy is affected.
- AC-005: `harness/evolution/results.tsv` and `harness/evolution/state.json` are updated through the evolution completion flow.

## Non-Goals

- No product runtime changes.
- No new Workbench test split in this evolution change.
- No broad ECL/template rewrite without repeated evidence of a current rule gap.

## Constraints

- Pending evolution is not auto-applied; changes require evidence, proposal, review, validation, and completion logging.
- Current docs should not become an archive ledger.
- If existing rules are sufficient, record `keep` or `noop` rather than adding duplicate process text.

## Risks

- Over-promoting archive details could bloat current docs.
- Under-recording repeated test strategy lessons could cause future agents to rerun long Workbench aggregates unnecessarily.
