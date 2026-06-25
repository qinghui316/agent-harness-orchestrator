# Spec: auto-evolve-post-scheduler-integration-window

## Goal

Evaluate the pending Harness evolution window ending with
`20260625-workbench-scheduler-integration-apply-discard-real-acceptance-v1`
and complete the evolution lifecycle with evidence, independent review,
validation, result logging, and pending cleanup.

## Users

- Future AHO agents reading current handoff docs.
- Maintainers deciding whether repeated archive lessons should become current
  ECL/template/lint rules.

## Acceptance Criteria

- AC-001: The five candidate archives are reviewed and summarized in an
  evolution proposal.
- AC-002: The proposal includes an Experience Retention Scan with
  Promote/Retain/Merge/Retire/Archive-only decisions.
- AC-003: An authorized subagent provides independent review/scoring or the
  change records why review was unavailable.
- AC-004: `harness/evolution/results.tsv` records exactly one result for this
  pending window and `harness/evolution/pending.md` is cleared via
  `harness-evolve mark-complete`.
- AC-005: Current handoff docs and generated index are consistent after close.

## Non-Goals

- Do not change product runtime, Workbench behavior, scheduler behavior, or
  automation permissions.
- Do not add a new ECL/template/lint rule unless repeated evidence shows an
  uncovered reusable rule gap.
- Do not copy detailed E-drive run history into current handoff docs.

## Constraints

- Use the active ECL change lifecycle and close it when complete.
- User authorized subagent review for this pending evolution.
- Preserve generated-index ownership: regenerate, do not hand-edit
  `harness/changes/INDEX.json`.

## Risks

- Over-promoting one-off product blockers into Harness rules would add process
  weight without improving future implementation quality.
- Under-recording the restore-path blocker could cause future agents to repeat
  failed UI acceptance setup.

