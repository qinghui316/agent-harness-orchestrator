# Spec: auto-evolve-post-integrationfix-apply-window

## Goal

Evaluate the pending Harness evolution window and decide whether any durable
Harness rule, review-template prompt, lint check, current-doc correction, or
product-runtime change is justified.

## Acceptance Criteria

- AC-001: Candidate archives from `harness/evolution/pending.md` are reviewed.
- AC-002: Proposal records an Experience Retention Scan covering Promote,
  Retain, Merge, Retire, and Archive-only decisions.
- AC-003: Independent subagent review/score is recorded.
- AC-004: The final decision is recorded in `harness/evolution/results.tsv` and
  `pending.md` is cleared through `harness-evolve mark-complete`.
- AC-005: Any current-doc or template changes are minimal and justified by
  repeated archive evidence; if no durable delta is justified, result is `noop`.
- AC-006: Harness checks pass and handoff docs agree on active/pending/latest
  state before close.

## Candidate Evidence

- `harness/changes/archive/20260625-auto-evolve-post-feedback-real-ui-window/summary.md`
- `harness/changes/archive/20260625-workbench-scheduler-worker-progression-to-integration-candidate-v1/summary.md`
- `harness/changes/archive/20260625-workbench-codex-backed-integrationfix-real-repair-v1/summary.md`
- `harness/changes/archive/20260626-workbench-integrationfix-real-ui-acceptance-v1/summary.md`
- `harness/changes/archive/20260626-workbench-repaired-integration-apply-real-ui-acceptance-v1/summary.md`

## Non-Goals

- Do not change product runtime.
- Do not add another IntegrationFix, scheduler, Workbench, or automation layer.
- Do not promote one-off real UI run details into current docs.
- Do not auto-apply future Harness evolution from scoped automation.

## Assumptions

- User authorization for subagent review is explicit in the current request.
- The likely result is `noop` unless the subagent identifies a repeated gap not
  covered by existing ECL/template rules.
