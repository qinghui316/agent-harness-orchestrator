# Spec: main-agent-old-seam-retirement-v5d-inbound-only-action-alias-finalization

## Goal

Make `main-agent.execution.*` the only canonical public main-agent execution
action family while preserving `role.pipeline.*` as a permanent inbound-only
compatibility bridge for historical data and old callers.

## Users

- Workbench users resuming old topics or actions.
- Future agents maintaining main-agent execution boundaries.
- Harness reviewers verifying that old seams do not become new outbound
  payloads or permission expansion.

## Acceptance Criteria

- AC-001: `role.pipeline.start/stop/continue/reconcile` remain accepted inbound
  aliases and route to the same handlers as canonical `main-agent.execution.*`.
- AC-002: New generated Workbench/UI/server/current-gate payloads use
  `main-agent.execution.*` and do not emit `role.pipeline.*`.
- AC-003: Legacy inbound workflow service echoes may preserve original
  `request.actionType` in started/completed/failed thread entries, decision
  records, and action results; this exception is documented and tested.
- AC-004: Production code cannot use `toLegacyMainAgentExecutionAction` to
  generate legacy outbound payloads.
- AC-005: Legacy aliases do not enter automation allowlists, high-impact action
  expansion, revalidated action expansion, Goal Loop recommendations,
  Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or Harness
  evolution paths.
- AC-006: `MainAgentLoopProjection` remains non-executing and out of
  confirmation card / transcript user surfaces.

## Non-Goals

- Delete legacy registry or handler aliases.
- Migrate or rewrite historical thread/action records.
- Rename internal demand-worker `rolePipeline: result`.
- Change Workbench UI layout or user-facing controls.
- Expand permissions or automatic execution.

## Constraints

- Harness truth remains Change/ECL, ToolPolicyGate, validation/audit,
  confirmationQueue, apply/close, and Harness evolution.
- Registry/live set compatibility is preserved for historical inbound actions.
- Any retained legacy string literal must be categorized as registry,
  normalizer, handler alias, compatibility test, or historical echo fixture.

## Risks

- Directly deleting legacy aliases could break durable historical payload
  replay or old gates.
- Leaving a legacy conversion helper available to production could reintroduce
  legacy outbound payload generation.
- Overbroad grep tests could mistake historical echo fixtures for generated
  outbound payloads.
