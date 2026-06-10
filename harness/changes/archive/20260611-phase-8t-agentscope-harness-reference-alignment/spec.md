# Spec: Phase 8T AgentScope Harness Reference Alignment

## Goal

Add AgentScope 2.0 Python as an explicit reference project and refresh the existing AgentScope Java Harness reference so AHO's next runtime/parallel design work is grounded in mature harness practice.

## Users

- AHO maintainers planning future parallel scheduler, true subagent, sandbox, and worker-session work.
- Future agents reading `docs/references/index.md` and reference maps before making architecture changes.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8S closed, latest Harness evolution closed, and Phase 8T active.
- AC-002: `agentscope-ai/agentscope` is added as a reference project and appears in `docs/references/index.md`.
- AC-003: A new AgentScope 2.0 reference map documents event/message, permission, workspace/sandbox, multi-session service, and agent team lessons.
- AC-004: Existing AgentScope Java reference map is updated with v2 Harness-layer details.
- AC-005: AHO docs clearly distinguish AgentScope runtime/harness ideas from AHO workflow truth.
- AC-006: Docs record that SchedulerContract should not jump directly to parallel execution without worker session, runtime workspace, event source, permission, and recovery boundaries.
- AC-007: No product runtime, Workbench, CLI, route, action, UI, scheduler, parallel execution, child Change creation, ODWF JS runtime, or cache/replay behavior changes.
- AC-008: Reference code is not vendor-copied into AHO product code.
- AC-009: Harness verification passes.
- AC-010: Product verification passes, or any pre-existing failure is clearly recorded.
- AC-011: `README.md` remains unrelated and untracked.

## Non-Goals

- Implementing runtime continuity.
- Implementing parallel scheduler, true subagents, sandbox execution, worker sessions, or event replay.
- Replacing AHO's Change/ECL truth model with AgentScope runtime state.
- Copying AgentScope source into AHO product modules.

## Constraints

- This phase may modify docs, ECL artifacts, `.gitmodules`, and reference submodule metadata only.
- Reference updates must be evidence-based and name inspected source/docs areas.
- AHO workflow truth remains Change/ECL, accepted artifacts, Run/Validation/Audit evidence, apply/close/human gates, and Harness evolution records.
- Keep `README.md` excluded.

## Risks

- Confusing AgentScope's general-purpose runtime/harness model with AHO's spec-anchored development OS.
- Jumping from SchedulerContract directly to a parallel executor without worker session/workspace/event/permission/recovery boundaries.
- Treating file size or reference alignment as a reason to resume broad modularization.
