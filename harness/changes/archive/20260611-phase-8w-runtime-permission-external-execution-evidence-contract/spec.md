# Spec: Phase 8W Runtime Permission External Execution Evidence Contract

## Goal

Add Runtime Continuity v1.1 evidence for permission profile attachment, existing ToolPolicy decisions, and external execution lifecycle without changing runtime authority or public artifact shapes.

## Users

- Future AHO scheduler / worker-session implementation that needs replayable worker event evidence before parallel execution.
- Maintainers inspecting worker runs and policy boundaries.
- Workbench users indirectly, through unchanged existing run/evidence surfaces.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8V closed and Phase 8W active, with no stale Phase 8V active claim.
- AC-002: Runtime Continuity has typed helpers for permission profile, mirrored ToolPolicy decision, and external execution evidence.
- AC-003: New evidence is written to existing `agent-events.jsonl`; no new public artifact surface is introduced.
- AC-004: Canonical scope for new evidence always comes from `WorkerSession`.
- AC-005: Raw payload cannot forge canonical scope fields.
- AC-006: Code / Validation / Audit record `permission.profile.attached` and external execution requested/completed/failed lifecycle evidence.
- AC-007: Existing lifecycle events, artifact shapes, CLI output, Workbench projections, and result semantics remain unchanged.
- AC-008: ToolPolicyGate remains the policy authority; Phase 8W does not add a permission engine or HITL prompt.
- AC-009: SchedulerContract remains non-executing and creates no runtime artifacts.
- AC-010: New runtime-continuity helpers do not depend on Workbench, server, web UI, CLI command modules, or broad facades.
- AC-011: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- No permission engine, HITL prompt, or change to `evaluateToolPolicy()`.
- No Workbench action, HTTP route, CLI command, UI/lazy projection, or public artifact change.
- No scheduler, parallel executor, TaskRun/WorkerLease/AgentTask/WorkflowRun/TaskQueueRun creation, worktree creation, run creation, child Change creation, ODWF runtime, or cache/replay.

## Constraints

- Existing `run.json`, `validation.json`, `audit.json`, raw event JSONL, CLI output, Workbench projections, and ToolEventAudit behavior must stay compatible.
- Permission/external execution evidence must be normalized through Runtime Continuity and derive canonical scope from `WorkerSession`.
- AgentScope is a reference for boundary shape only; no vendor-copied code or permission bypass model.

## Risks

- Duplicating existing lifecycle events could confuse replay semantics; new events must be clearly normalized wrapper evidence, not replacements.
- A new permission helper could be mistaken for authority; docs and tests must preserve ToolPolicyGate as the only policy authority.
