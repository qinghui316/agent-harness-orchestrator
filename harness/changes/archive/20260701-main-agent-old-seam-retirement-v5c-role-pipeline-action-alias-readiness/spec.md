# Spec: main-agent-old-seam-retirement-v5c-role-pipeline-action-alias-readiness

## Goal

Prove and enforce that `role.pipeline.*` is legacy inbound compatibility only,
while `main-agent.execution.*` is the canonical public action id family.

## Users

- Future agents continuing old seam retirement.
- Workbench users relying on current main-agent execution behavior.
- Harness maintainers protecting action/revalidation/automation boundaries.

## Acceptance Criteria

- AC-001: A consumer inventory classifies remaining `role.pipeline.*`
  appearances as canonical-only, legacy inbound compatibility, test-only, or
  docs/archive-only.
- AC-002: Production literal `role.pipeline.*` appearances are limited to the
  workflow action registry, main-agent execution normalizer, and handler alias
  map.
- AC-003: Generated Workbench UI/server/current-gate outbound payloads use
  `main-agent.execution.*`, not `role.pipeline.*`.
- AC-004: Legacy inbound `role.pipeline.*` actions continue to route through
  the same handlers, labels, summaries, stop conflict bypass, and revalidation
  semantics as canonical actions.
- AC-005: Automation allowlists, ToolPolicyGate, Scheduler, IntegrationCheck,
  apply/close, remote, PR, merge, and Harness evolution authority are
  unchanged.
- AC-006: The change records whether V5d can delete `role.pipeline.*` or must
  keep it as permanent inbound-only compatibility.

## Non-Goals

- Delete `role.pipeline.*`.
- Delete `MainAgentLoopProjection`.
- Delete internal demand-worker `rolePipeline: result`.
- Change the `mainAgentExecution` DTO shape.
- Add UI or new action surfaces.

## Constraints

- Historical thread/decision records may preserve legacy inbound
  `request.actionType` as compatibility evidence and must not be treated as
  generated outbound violations.
- Helper-based compatibility through `normalizeMainAgentExecutionAction()` is
  allowed outside literal legacy-id allowlisted files.
- New full-access, Scheduler, IntegrationCheck, apply/close, remote, PR, merge,
  and Harness evolution authority is forbidden.

## Risks

- Over-aggressive deletion could break historical action payloads or stop
  conflict bypass.
- Over-broad allowlists could let new legacy outbound payloads creep back in.
- Confusing literal legacy strings with helper-based compatibility could cause
  false positives or unsafe cleanup.

