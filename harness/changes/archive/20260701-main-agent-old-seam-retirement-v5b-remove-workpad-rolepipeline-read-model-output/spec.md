# Spec: main-agent-old-seam-retirement-v5b-remove-workpad-rolepipeline-read-model-output

## Goal

Remove the legacy Workpad public read-model field `rolePipeline` so Workbench
consumers use canonical `mainAgentExecution` only.

## Users

- Workbench users, who should see unchanged main-agent execution behavior.
- Future agents and maintainers, who should not see two public Workpad fields
  for the same main-agent execution summary.

## Acceptance Criteria

- AC-001: Workbench Workpad snapshots include `mainAgentExecution` and no longer
  include own property `rolePipeline`.
- AC-002: Backend and frontend Workpad DTO types no longer declare Workpad
  `rolePipeline`.
- AC-003: Workpad backend/frontend consumers no longer fallback from
  `mainAgentExecution` to `rolePipeline`.
- AC-004: Confirmation suppression, decision inspector, Agent graph, Workpad
  rows/details/surface text continue to work from `mainAgentExecution`.
- AC-005: `role.pipeline.*` action aliases, `MainAgentLoopProjection`,
  Scheduler, IntegrationCheck, confirmation/revalidation, automation, apply,
  close, remote, PR, merge, and Harness evolution authority are unchanged.
- AC-006: Handoff docs and V5a archive wording reflect that V5b removed only
  Workpad public read-model `rolePipeline` output.

## Non-Goals

- Do not delete or rename `role.pipeline.*` action ids.
- Do not delete `MainAgentLoopProjection`.
- Do not rename internal demand-worker `rolePipeline` result fields.
- Do not change action registry semantics, automation allowlists, Scheduler,
  IntegrationCheck, ToolPolicyGate, apply/close, or Goal Loop authority.

## Constraints

- `mainAgentExecution` keeps the existing wire shape.
- V5b is a deletion/cleanup change, not a new evidence layer.
- Workbench server and Web client are versioned together locally.

## Risks

- Some test fixtures still assume V5a dual-field output and must be updated.
- A broad grep can confuse `role.pipeline.*` action aliases or internal
  demand-worker `rolePipeline` fields with the Workpad public read-model field;
  those must be preserved.
