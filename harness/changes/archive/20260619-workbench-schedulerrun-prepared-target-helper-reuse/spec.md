# Spec: Workbench SchedulerRun Prepared Target Helper Reuse

## Goal

Consolidate repeated Workbench SchedulerRun prepared-target revalidation checks
into the existing Workbench action target helper owner while preserving current
action behavior, errors, and human-gated workflow boundaries.

## Users

- Agents implementing Workbench action handling who need a single owner for
  stale-target / prepared-state checks.
- Reviewers checking that action revalidation logic remains fail-closed without
  feature-local mini gate frameworks.

## Acceptance Criteria

- AC-001: `src/workbench/actions/active-target.ts` exports a pure helper for
  prepared Workbench action targets and remains free of scheduler runtime,
  repository, ToolPolicyGate, server, UI, and Goal Loop dependencies.
- AC-002: `src/workbench/actions/boundary.ts` reuses the helper only for
  SchedulerRun checks whose existing semantics require matching id, matching
  change id, and `prepared` status with the existing
  `SchedulerRun target is stale or not prepared.` error wording.
- AC-003: `planning.scheduler.plan.prepare` and
  `planning.scheduler.run.complete` keep their distinct validation semantics and
  are not folded into the prepared helper.
- AC-004: Targeted tests cover id mismatch, change mismatch, and status mismatch
  for the new helper, plus owner-module dependency constraints.

## Non-Goals

- Do not change Workbench action ids, payloads, projections, server routes, or UI.
- Do not combine prepared-state checks with latest-target repository reads.
- Do not change scheduler execution, dispatch, worker, rework, validation,
  audit, integration, source apply, close, merge, or Goal Loop behavior.

## Constraints

- AHO workflow truth remains Change/ECL files, accepted artifacts, Run,
  Validation, Audit, IntegrationCheck, human Apply/Close gates, and Harness
  evolution.
- Reference projects are design evidence only and are not needed for this local
  helper-reuse slice.
- The helper must be pure and owned by `src/workbench/actions/active-target.ts`;
  domain-specific scheduler artifact checks remain in their existing action
  branches.

## Risks

- Over-extracting distinct checks would blur fail-closed error semantics. This
  is controlled by explicitly excluding `plan.prepare` and `run.complete`.
- A helper that reads repositories or scheduler runtime state would create a new
  cross-module gate. This is controlled by keeping latest checks separate and by
  testing owner-module imports.
