# Spec: Auto Evolve Harness Phase 9F 9J Scheduler Worker Gates Evidence

## Goal

Handle the generated Harness evolution pending window after Phase 9J and determine whether Phase 9F-9J exposed a reusable Harness rule gap.

## Users

- Future Codex/AHO agents using ECL and Harness rules to continue scheduler work safely.
- Project maintainers reviewing whether scheduler worker gate evidence requires new process rules.

## Acceptance Criteria

- AC-001: `harness/evolution/pending.md` is handled through a structured ECL change.
- AC-002: The Phase 9F-9J archive window is reviewed against existing Harness rules.
- AC-003: Independent subagent review is recorded with scope, recommendation, score, and limitations.
- AC-004: The result is `noop/subagent_review` unless a concrete rule gap is found.
- AC-005: If no rule gap is found, no product code, runtime behavior, Workbench action, route, CLI command, UI, scheduler execution, or parallel executor behavior changes.
- AC-006: Evolution proposal, review, validation notes, results row, and mark-complete evidence are recorded.
- AC-007: Handoff docs end with active change none, pending evolution none, and latest Harness evolution pointing to the archived auto-evolve change.
- AC-008: `README.md` remains unrelated and untracked.
- AC-009: Harness verification passes.

## Non-Goals

- Do not add new ECL lint, template, or docs rules unless review identifies a concrete gap.
- Do not implement scheduler runtime, parallel executor, worker start changes, UI changes, or product behavior.
- Do not close or modify scheduler product artifacts beyond recording Harness evolution evidence.

## Constraints

- Pending evolution is maintenance evidence, not product work.
- Existing Future Feature Module Boundary Rule remains the default owner-module guard.
- Scheduler worker gates remain scoped evidence slices; they do not redefine workflow truth.
- Any new rule must be evidence-backed and small enough to justify permanent process overhead.

## Risks

- Overfitting one scheduler sequence into unnecessary permanent Harness rules.
- Under-documenting a real boundary gap if the archive window shows repeated drift.
- Accidentally changing product behavior while handling what should be a Harness-only noop review.
