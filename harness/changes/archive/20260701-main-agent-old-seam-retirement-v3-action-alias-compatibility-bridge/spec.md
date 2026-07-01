# Spec: main-agent-old-seam-retirement-v3-action-alias-compatibility-bridge

## Goal

Add public action id compatibility for main-agent execution without breaking
existing `role.pipeline.*` callers. New canonical ids use
`main-agent.execution.*`; legacy ids remain supported as aliases and normalize
to the same main-agent execution family.

## Users

- AHO runtime and Workbench action handlers that need a canonical main-agent
  execution action family.
- Future agents retiring old role-pipeline terminology while preserving
  existing Harness safety and compatibility.

## Acceptance Criteria

- AC-001: `main-agent.execution.start/stop/continue/reconcile` and
  `role.pipeline.start/stop/continue/reconcile` normalize to the same canonical
  action ids, with a legacy conversion helper for compatibility.
- AC-002: Workflow action registry and live registry include canonical ids while
  keeping legacy ids.
- AC-003: Canonical and legacy ids route through the same main-agent execution
  handlers; stop ids both bypass active workflow conflict checks.
- AC-004: Backend labels, action result summaries, frontend labels, and thread
  stream labels use the shared action-family helper and show the same user
  semantics for canonical and legacy ids.
- AC-005: Automation allowlist, Goal Loop recommendations, confirmation queue,
  action revalidation, Scheduler, IntegrationCheck, ToolPolicyGate, apply,
  close, remote, merge, PR, and Harness evolution authority are unchanged.
- AC-006: `rolePipeline`, `MainAgentLoopProjection`, and legacy
  `role.pipeline.*` compatibility remain available.
- AC-007: Handoff/current-plan drift is corrected for V2/V3, including a
  correction note on the V2 archived review.

## Non-Goals

- Deleting `role.pipeline.*` ids.
- Deleting or renaming the `rolePipeline` read-model field.
- Deleting `MainAgentLoopProjection`.
- Expanding scoped automation or Goal Loop capabilities.
- Changing UI defaults to always emit canonical ids.
- Touching Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or
  Harness evolution behavior.

## Constraints

- This change is an alias bridge, not final seam removal.
- New and legacy actions must delegate to one implementation path; no copied
  execution logic.
- Canonical ids must not enter the automation allowlist.
- User-visible terms should say "main-agent execution" semantics, not revive
  role-pipeline wording.

## Risks

- Registry expansion could accidentally make canonical ids eligible for
  automation or recommendation paths.
- Duplicate handler registration could drift if execution logic is copied.
- Frontend/backend label helpers could diverge if they keep local
  `role.pipeline.*` checks.
