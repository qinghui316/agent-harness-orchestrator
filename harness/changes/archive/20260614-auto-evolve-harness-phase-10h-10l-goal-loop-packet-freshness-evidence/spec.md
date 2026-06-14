# Spec: Auto Evolve Harness Phase 10H 10L Goal Loop Packet Freshness Evidence

## Goal

Decide whether the Phase 10H through Phase 10L Goal Loop evidence window exposes a durable Harness rule gap, especially around stale `GoalLoopNextStepPacket` recommendations entering main-Agent context or Workpad summaries.

## Users

- Future AHO implementers extending Goal Loop packets, prompt context, Workpad projections, or recommendation policy.
- Reviewers checking that Goal Loop evidence remains explanatory and non-executing.
- Maintainers relying on Harness evolution to convert repeated defects into durable rules only when the evidence justifies it.

## Acceptance Criteria

- AC-001: The pending evolution window is evaluated against current ECL, boundary docs, review template, and lint coverage.
- AC-002: Independent review is recorded when available; if subagent review is unavailable, the limitation is recorded and the result is not mislabeled as `subagent_review`.
- AC-003: A proposal file records the recommendation, evidence, limitations, and validation.
- AC-004: If a real rule gap exists, the accepted delta is the smallest docs/template/lint change needed to prevent recurrence.
- AC-005: If existing rules are sufficient, the window is marked complete as `noop/subagent_review` or `noop/dry_run` according to actual evaluation mode.
- AC-006: `harness/evolution/pending.md` is removed by `harness-evolve.ps1 mark-complete`.
- AC-007: AGENTS.md and docs/STATUS.md end with active none, pending none, and latest Harness evolution pointing at this archived change.
- AC-008: No product runtime behavior, Workbench action, route, CLI command, UI, scheduler execution, source mutation, or artifact runtime shape changes.

## Non-Goals

- Do not add a Goal Loop controller.
- Do not add a Workbench action, HTTP route, CLI command, UI control, lazy projection, scheduler loop, worker start, source mutation, child Change, or product runtime behavior.
- Do not broaden module refactors.
- Do not treat subagent failure as a valid independent review result.

## Constraints

- Use existing ECL lifecycle and close protocol.
- Keep `README.md` unrelated and untracked.
- Any Harness rule delta must be evidence-backed by the Phase 10H-10L archive window.
- No independent review means no automatic modify result.

## Risks

- Overfitting one product defect into too much process.
- Under-specifying packet freshness so future Goal Loop prompt/projection changes can reintroduce stale recommendations.
- Incorrectly claiming `subagent_review` when the subagent could not complete.
