# Spec: main-agent-old-seam-retirement-v4-canonical-payload-default-audit

## Goal

Make `main-agent.execution.*` the canonical action id family for all new
main-agent execution payloads, while keeping `role.pipeline.*` as legacy inbound
compatibility. This prevents old mental-model action ids from leaking back into
new production paths without breaking existing history or compatibility.

## Users

Developers and future agents maintaining the main-agent architecture migration.
End users should see no UI behavior change.

## Acceptance Criteria

- AC-001: New production payload generation does not emit `role.pipeline.*`
  outside the explicit legacy alias surface.
- AC-002: Canonical and legacy action ids still route to the same main-agent
  execution handlers and labels.
- AC-003: `role.pipeline.*` remains available as inbound compatibility, but is
  not added to automation allowlists or Goal Loop authority.
- AC-004: `rolePipeline` and `MainAgentLoopProjection` remain live seams and are
  not deleted or exposed as new user-visible controls.
- AC-005: Handoff docs describe V4 accurately and keep the next migration step
  clear.

## Non-Goals

- Do not remove `role.pipeline.*` from registries, handler maps, or historical
  compatibility tests.
- Do not rename or remove `rolePipeline` read-model fields.
- Do not remove `MainAgentLoopProjection`.
- Do not change Workbench UI, confirmation queue behavior, Scheduler,
  IntegrationCheck, apply/close, remote, merge, PR, or Harness evolution paths.

## Constraints

- Allowed `role.pipeline.*` production occurrences are limited to the action
  registry, main-agent execution normalizer/helper, handler alias map, and
  compatibility tests/docs.
- Any legacy action id found in a new outbound payload path must be converted to
  the canonical id instead of adding a second local special case.
- Harness authority remains Change/ECL, ToolPolicyGate, validation/audit,
  confirmationQueue, apply/close, and Harness evolution records.

## Risks

- Over-broad cleanup could break legacy action replay or Workbench compatibility.
- Over-broad tests could falsely ban live `rolePipeline` or
  `MainAgentLoopProjection` read-model seams.
- Under-scoped tests could allow future code to generate legacy outbound action
  ids again.
