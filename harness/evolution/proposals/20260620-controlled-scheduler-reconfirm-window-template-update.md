# Harness Evolution Proposal: Controlled Scheduler Reconfirm Window

## Status

Proposed result: `template_update`

Evaluation mode: `independent_review`

## Candidate Window

Pending evolution was generated after these candidate archives:

- `harness/changes/archive/20260620-controlled-scheduler-advance-post-step-evaluation/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-post-step-visible-readiness-handoff/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-stop-handoff/summary.md`
- `harness/changes/archive/20260620-workflow-result-summary-thread-visibility/summary.md`
- `harness/changes/archive/20260620-controlled-scheduler-reconfirm-copy/summary.md`

## Evaluation

The window shows repeated product work around making controlled scheduler
continuation useful and honest:

- one confirmed controlled advance refreshes next-step evidence and stops;
- post-step readiness is prepared only as non-executing evidence;
- result summaries become visible in thread/read-model surfaces;
- the right confirmation card now explains refreshed current evidence as a new
  single-step confirmation rather than an automatic loop;
- UI-affecting changes use real Workbench DOM coverage.

The risks observed in the window are mostly covered by current ECL sections:

- Workbench User-Surface Honesty Coverage covers real UI wording, fake future
  capabilities, duplicate primary actions, and high-impact action paths.
- Scoped Workbench Action Payload Coverage covers target ids and fail-closed
  action payloads.
- Read Model Projection Coverage covers projection scope and workflow-truth
  boundaries.
- Goal Loop Boundary Coverage covers non-executing recommendation authority,
  stale evidence, and human gates.
- Module Boundary Coverage and Core Mechanism Reuse Coverage cover owner
  modules and avoiding feature-local frameworks.
- Documentation Entropy and Experience Lifecycle cover handoff/current-doc
  drift and archive-only experience retention.

## Action Decision

Update the review template to include the existing ECL `Transcript Renderer
Source-Boundary Coverage` section. Do not add a new ECL rule, script, lint, or
product runtime behavior.

Reason: the `workflow-result-summary-thread-visibility` candidate touched the
main thread / parent-agent transcript surface. `docs/ECL.md` already has the
rule, but the default review template did not include a matching section. The
template should route future agents to that review coverage without adding new
process concepts.

## Experience Lifecycle Scan

- Promote: sync the existing Transcript Renderer Source-Boundary Coverage rule
  from `docs/ECL.md` into `harness/templates/change/reviews/review.md`.
- Retain: existing Workbench User-Surface Honesty, Scoped Workbench Action
  Payload, Read Model Projection, Transcript Renderer Source-Boundary, Goal
  Loop Boundary, Module Boundary, Core Mechanism Reuse, Documentation Entropy,
  and Experience Lifecycle rules.
- Merge: none. The relevant rules are already general and not duplicated in
  this proposal.
- Retire: none. No current rule is superseded by this window.
- Archive-only: specific implementation details about post-step handoff DTOs,
  thread result-summary fields, and reconfirmation copy wording remain in the
  archived summaries and tests.

## Validation Plan

- Independent subagent review of this candidate window and proposal.
- Harness lint and encoding checks.
- `harness-evolve.ps1 mark-complete -Status template_update -EvalMode independent_review`.
- Reindex/status/evolve checks after mark-complete.
