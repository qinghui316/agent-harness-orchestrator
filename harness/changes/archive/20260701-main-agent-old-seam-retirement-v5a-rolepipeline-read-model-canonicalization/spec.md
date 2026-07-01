# Spec: main-agent-old-seam-retirement-v5a-rolepipeline-read-model-canonicalization

## Goal

Canonicalize the Workbench read-model name for main-agent role execution from
legacy `rolePipeline` to `mainAgentExecution` while keeping compatibility for
existing consumers and historical fixtures.

## Users

- Future AHO agents and maintainers working on main-agent orchestration.
- Workbench users indirectly, because projections and UI must not regress.

## Acceptance Criteria

- AC-001: Workpad read models expose `mainAgentExecution` and legacy
  `rolePipeline` with matching content when role execution evidence exists.
- AC-002: Backend projections that suppress confirmations, inspect decisions,
  or build Agent graph nodes prefer `mainAgentExecution` and fall back to
  legacy `rolePipeline`.
- AC-003: Frontend Workpad rows/details/surface text prefer
  `mainAgentExecution` and fall back to legacy `rolePipeline`.
- AC-004: Existing legacy `rolePipeline` fixtures remain compatible.
- AC-005: No Harness authority, action registry, automation allowlist,
  Scheduler, IntegrationCheck, apply/close, remote, PR, merge, or Harness
  evolution behavior changes.
- AC-006: Current handoff docs identify V5a as read-model canonicalization and
  keep V5b as the later deletion decision.

## Non-Goals

- No deletion of `rolePipeline`, `role.pipeline.*`, or
  `MainAgentLoopProjection`.
- No schema redesign beyond adding the canonical alias field.
- No UI layout or interaction redesign.
- No new evidence family, action bridge, Scheduler path, or workflow authority.

## Constraints

- `mainAgentExecution` must share the same wire shape as the existing role
  execution summary in V5a.
- Build the execution summary once; do not create divergent new/old builders.
- Consumers must use a small fallback helper or equivalent centralized
  pattern, not scatter inconsistent read logic.
- Existing Chinese/English user-facing text must not introduce new
  "role pipeline" phrasing.

## Risks

- Inconsistent consumers could keep using only `rolePipeline`, leaving the
  canonical field ineffective.
- Reworking the shape or renaming too broadly could break Agent graph, Workpad
  details, or test fixtures without product value.
- Removing legacy fields too early could break historical snapshots or
  compatibility paths.
