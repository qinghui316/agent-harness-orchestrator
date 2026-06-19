# Spec: Workbench Scheduler Planning Latest Target Helper Adoption

## Goal

Consolidate scheduler planning-chain latest-target revalidation in Workbench
action handling onto the existing shared Workbench action target helper.

## Users

- Agents maintaining Workbench high-impact action revalidation.
- Reviewers checking that target guards stay fail-closed without feature-local
  gate patterns.

## Acceptance Criteria

- AC-001: `src/workbench/actions/boundary.ts` uses
  `assertLatestWorkbenchActionTarget` for identical scheduler planning-chain
  latest target id checks in `planning.scheduler.worker-plan.compile`,
  `planning.scheduler.launch-preflight.check`, and
  `planning.scheduler.run.prepare`.
- AC-002: The change does not alter stale, lineage, status, ToolPolicyGate,
  human-gate, Goal Loop, scheduler execution, Workbench UI/projection, action
  id, or payload semantics.
- AC-003: `planning.scheduler.plan.prepare` snapshot/reservation latest checks
  and `planning.scheduler.run.complete` terminal-run semantics remain out of
  scope and unchanged.
- AC-004: Tests verify representative helper adoption and preserve the pure
  owner-module boundary for `src/workbench/actions/active-target.ts`.

## Non-Goals

- Do not add a new helper or validation framework.
- Do not change scheduler runtime artifacts, launch behavior, worker handling,
  IntegrationCheck, apply/close, or Goal Loop behavior.
- Do not update reference project source or broaden product roadmap docs.

## Constraints

- AHO workflow truth remains Change/ECL files, accepted artifacts, Run,
  Validation, Audit, IntegrationCheck, human Apply/Close gates, and Harness
  evolution.
- The shared owner is `src/workbench/actions/active-target.ts`; the action
  boundary remains the compatibility/action dispatch surface.
- Reference projects are evidence only and are not needed for this local helper
  reuse slice.

## Risks

- Replacing checks with different semantics could obscure fail-closed behavior.
  This is controlled by limiting adoption to exact `latest.id !== target.id`
  checks with identical error wording.
- Over-documenting this small convergence slice could add handoff entropy. This
  is controlled by updating only active/STATUS pointers and archive evidence.
