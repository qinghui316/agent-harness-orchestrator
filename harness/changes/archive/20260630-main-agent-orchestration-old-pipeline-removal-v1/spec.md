# Spec: main-agent-orchestration-old-pipeline-removal-v1

## Goal

Make `src/main-agent-orchestration/` the only main workflow control layer for
the current coder -> validator -> auditor -> optional rework sequence.

## Users

- Maintainers evolving AHO from a fixed engineering pipeline toward a main-agent
  continuous orchestration loop.
- Future agents adding leaf roles, recovery, scheduler integration, or normal
  Agent mode without piling more logic into the old workflow runtime kernel.

## Acceptance Criteria

- AC-001: `runMainAgentToolOrchestration` imports/calls the new
  `main-agent-orchestration` owner and no longer imports/calls the old
  `runCodeValidateAuditSequence`.
- AC-002: `runCodeValidateAuditSequence` remains only as a thin compatibility
  facade and does not own coder -> validator -> auditor -> rework ordering.
- AC-003: Leaf stage functions run exactly one role each and do not call the
  decision engine or start a following stage.
- AC-004: Existing behavior is preserved for success, code setup failure,
  boundary failure, validation/audit failure, and rework-exhausted paths.
- AC-005: ToolPolicyGate, RoleDispatcher, AgentTask lifecycle, run artifacts,
  boundary audit, maintenance ledger, live events, and artifact refs remain
  intact.
- AC-006: Confirmation queue, scoped automation allowlist, action revalidation,
  TaskQueue/task-run facade, scheduler, apply/close, remote, PR, merge, and
  Harness evolution are not taken over or expanded.
- AC-007: No Workbench UI card, tab, confirmation context, or transcript evidence
  disclosure is added or restored.

## Non-Goals

- Do not implement free-form main-agent reasoning, parallel scheduling, journal
  recovery, child Changes, ordinary Agent mode, provider changes, or UI changes.
- Do not import Open Dynamic Workflows runtime.
- Do not change action registry, automation allowlist, confirmation
  revalidation, apply/close, remote, PR, merge, or Harness evolution.

## Constraints

- The new owner may reuse the existing fixed decision engine for V1 behavior,
  but the decision loop must live outside leaf stage functions.
- Old callers may keep the old function name only through a facade.
- The facade must support legacy parameters such as `taskIds`, `taskRunId`,
  `executionGate`, `initialRole`, and rework prompts.
- The architecture change must not produce user-visible UI differences.

## Risks

- Risk: new and old controllers both remain active.
  Mitigation: tests assert `runMainAgentToolOrchestration` no longer calls the
  old sequence and the old sequence file is facade-only.
- Risk: side effects are lost during extraction.
  Mitigation: preserve role dispatcher, run creators, boundary audit,
  maintenance ledger, live events, and artifact refs in leaf stage tests.
- Risk: automation or permission boundaries widen.
  Mitigation: do not touch action registry, allowlist, revalidation, apply/close,
  or scheduler code except compatibility call sites.
