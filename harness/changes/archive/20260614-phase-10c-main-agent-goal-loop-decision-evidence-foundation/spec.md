# Spec: Phase 10C Main Agent Goal Loop Decision Evidence Foundation

## Goal

Add a scoped, non-executing `GoalLoopDecision` artifact that lets the main Agent evaluate the selected Change as a persistent Goal/Change loop and explain the next legal step from current repository and Harness evidence. The decision must support conflict-aware recommendations without becoming a workflow runtime, scheduler loop, or execution authorization.

## Users

- Main Agent: needs durable policy evidence for deciding and explaining the next loop step.
- Developer/user: needs a readable stage-gated explanation of why work can proceed in parallel, must wait, must rework, must integrate, or must stop for a human gate.
- Future agents: need a repository artifact that preserves the decision basis instead of relying on chat memory.

## Acceptance Criteria

- AC-001: `src/goal-loop/` owns `GoalLoopDecision` schemas/types, paths, repository, compiler, rendering, and facade exports.
- AC-002: `planning.goal-loop.evaluate` compiles latest + versioned JSON/Markdown `GoalLoopDecision` artifacts under the selected Change planning directory.
- AC-003: `GoalLoopDecision.executionStarted` is schema-literal `false`, and the action creates no TaskRun, WorkerLease, worktree, Run, WorkerSession, RuntimeWorkspace, EventSource, IntegrationCheck, apply/close, child Change, or scheduler worker artifact.
- AC-004: `GoalLoopDecision.authority` is `non-executing-planning-evidence` and docs/tests make clear that it is policy evidence, not workflow truth.
- AC-005: Recommended existing action types are only emitted when their required scope ids are present; otherwise the decision must choose a wait/blocked/human-gate style recommendation.
- AC-006: `planning.goal-loop.evaluate` is registered as workflow/live/high-impact/revalidated, requires selected `changeId`, and fail-closes on missing, archived, stale, or cross-change target.
- AC-007: `orchestrator.evaluate` remains demand-worker status inspection and does not write GoalLoopDecision evidence.
- AC-008: Workbench handler glue lives in an owned `goal-loop` action-handler module; broad handler/chat/server/frontend facades do not receive main implementation logic.
- AC-009: `src/goal-loop/*` does not depend on Workbench, server, web UI, CLI command modules, broad facades, or execution managers.
- AC-010: Docs record Phase 10C active and clarify that Goal Loop is main-agent policy over evidence, not scheduler execution.

## Non-Goals

- No scheduler loop, whole-wave dispatch, slot allocator, automatic worker chain, or full parallel executor.
- No worker start, validation, audit, rework, IntegrationCheck, apply, close, landing, PR, merge, or child Change creation.
- No new CLI command, HTTP route, frontend page, or lazy projection.
- No changes to existing Run, Validation, Audit, IntegrationCheck, Apply, SchedulerRun, Runtime Continuity, SSE, thread storage, or decision/audit public shapes.
- No replacement of Change/ECL, accepted artifacts, validation/audit, IntegrationCheck, Apply/Close, ToolPolicyGate, human gates, or Harness evolution.

## Constraints

- Keep the implementation modular and owner-module first.
- Do not copy Codex `Goal` runtime or Loop Engineering automation behavior as AHO truth.
- Continue excluding unrelated untracked `README.md`.
- If the new decision recommends a high-impact action, that recommendation remains explanatory; the actual action still requires its own scoped payload, stale-target revalidation, ToolPolicyGate, and human gate.

## Risks

- Risk: `GoalLoopDecision` could be mistaken for execution authorization.
  - Mitigation: literal `executionStarted: false`, authority classification, forbidden-actions list, tests for no execution artifacts.
- Risk: Adding another Workbench action could clutter the user surface.
  - Mitigation: action is a main-agent planning/evaluation gate; no new ordinary internal scheduler checkpoint UI is introduced.
- Risk: compiler may accidentally import execution modules.
  - Mitigation: module-boundary tests forbid runtime/execution imports and execution function names.
