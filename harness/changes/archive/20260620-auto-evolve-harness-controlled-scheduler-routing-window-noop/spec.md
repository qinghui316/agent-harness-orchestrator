# Spec: auto-evolve-harness-controlled-scheduler-routing-window-noop

## Goal

Resolve the pending Harness evolution after the controlled Scheduler routing/UI surface window without adding duplicate rules. The evolution should decide whether the five candidate archives reveal a new Harness gap or confirm that current Workbench User-Surface Honesty and review-template requirements are sufficient.

## Users

- Future agents using AHO Harness rules to validate UI-visible Workbench behavior.
- Reviewers deciding whether product-visible UI changes have real UI evidence rather than projection-only claims.
- The user, who wants product work to keep moving without repeated architecture-only churn.

## Acceptance Criteria

- AC-001: The five candidate archives in `harness/evolution/pending.md` are reviewed and linked in a proposal.
- AC-002: The proposal records a clear `noop` rationale if existing ECL/template coverage is sufficient, including the user's real-UI verification correction.
- AC-003: Independent subagent evaluation is recorded and agrees that no duplicate Harness rule/template update is needed, or any disagreement is resolved before close.
- AC-004: Experience Lifecycle scan records Promote, Retain, Merge, Retire, and Archive-only decisions.
- AC-005: `scripts/harness-evolve.ps1 mark-complete` records the noop result, removes pending evolution, and validation passes.
- AC-006: Handoff docs no longer point at the closed product active path and, after this evolution closes, steer the next agent back toward product-function work.

## Non-Goals

- No product runtime or Workbench behavior changes.
- No scheduler runtime, Goal Loop policy, action payload, ToolPolicyGate, stale revalidation, source apply, close, merge, IntegrationCheck, remote, or browser UI change.
- No new ECL/template/lint/script rule unless a concrete uncovered gap is found.
- No expansion of current docs with per-phase history.

## Constraints

- Controlled evolution must use proposal, independent review, validation, `results.tsv`, and `mark-complete`.
- Current docs should remember and forget: durable rules stay compact; historical detail stays in archive summaries.
- The existing real UI validation rule should not be duplicated if it already covers the user's correction.
- After this evolution, the next recommended work should resume product-function progress unless a real blocker appears.

## Risks

- Risk: a noop could miss an actual Harness gap. Mitigation: use independent subagent evaluation and explicit Experience Lifecycle scan.
- Risk: adding another rule would increase documentation entropy without improving compliance. Mitigation: choose noop if existing rules/templates are sufficient.
- Risk: handoff drift could leave future agents on the closed product active path. Mitigation: update and verify `AGENTS.md` and `docs/STATUS.md`.

