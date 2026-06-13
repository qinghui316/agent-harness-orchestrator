# Spec: Phase 10E Goal Loop Iteration Journal Evidence

## Summary

Phase 10E extends the existing non-executing Goal Loop surface with durable iteration evidence. `planning.goal-loop.evaluate` already records a `GoalLoopDecision`; after this phase it should also record a `GoalLoopIteration` that links the current decision to the prior iteration/decision and explains the current continuation verdict.

This is a product evidence increment, not a runtime loop. It makes long-running Goal/Change continuation auditable while preserving AHO workflow truth and all human gates.

## Requirements

- Reuse the existing Workbench action `planning.goal-loop.evaluate`; do not add a new action or new user-facing primary control.
- For every confirmed evaluation, write exactly one `GoalLoopDecision` and one `GoalLoopIteration`.
- Read previous latest `GoalLoopDecision` and `GoalLoopIteration` before writing the new decision so lineage is accurate.
- `GoalLoopIteration` must include:
  - `id`, `changeId`, `ordinal`
  - `authority = "non-executing-continuation-evidence"`
  - `trigger = "user-confirmed-evaluate"`
  - `iterationStatus = "recorded"`
  - explanatory `continuationVerdict`
  - `previousGoalLoopDecisionId?`, `previousGoalLoopIterationId?`
  - `goalLoopDecisionId`
  - copied decision snapshots for conflict assessment, completion audit, source evidence refs, and optional recommended action
  - `executionStarted = false`
  - artifact refs and timestamps
- Store latest and versioned JSON/Markdown artifacts under the selected Change path.
- Direct reads must fail closed on mismatched `changeId`, id mismatch, or malformed artifacts.
- Existing fallback priority remains unchanged: Goal Loop evaluation appears only when no concrete current confirmation exists.
- Workbench decision/action scope must preserve `goalLoopDecisionId` and `goalLoopIterationId`.
- Workbench result text must say an iteration was recorded and no execution started.

## Non-Goals

- No new CLI API, Workbench action, route, UI/lazy projection, scheduler loop, parallel executor, slot allocator, child Change, ODWF runtime, or cache/replay.
- No automatic execution of `GoalLoopDecision.recommendedAction`.
- No placement in `workpad.nextAction`.
- No creation of TaskRun, WorkerLease, worktree, Run, WorkerSession, RuntimeWorkspace, EventSource, IntegrationCheck, apply/close, validation, audit, rework, landing, PR, merge, or source mutation.
- No replacement of Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, ToolPolicyGate, Apply/Close human gates, or Harness evolution.

## Acceptance Criteria

- AC-001: `src/goal-loop/manager.ts` remains a facade and exports `GoalLoopIteration` public symbols.
- AC-002: New `src/goal-loop/*` iteration implementation files do not import Workbench, server, web, CLI, or scheduler worker-start implementations.
- AC-003: First explicit Goal Loop evaluation writes iteration ordinal `1` with no previous ids.
- AC-004: Second explicit Goal Loop evaluation writes ordinal `2` with previous iteration and previous decision ids pointing to the first evaluation.
- AC-005: `planning.goal-loop.evaluate` response and Workbench decision payload include `goalLoopDecisionId` and `goalLoopIterationId`, but do not make `recommendedAction` an executable fallback action.
- AC-006: `GoalLoopIteration` status/verdict naming cannot be confused with Change completion; close still requires existing human close gate.
- AC-007: Evaluation remains non-executing and creates no TaskRun, WorkerLease, worktree, Run, WorkerSession, RuntimeWorkspace, EventSource, IntegrationCheck, apply/close, child Change, scheduler loop, or source mutation.
- AC-008: Goal Loop fallback remains hidden when a concrete planning/scheduler/IntegrationCheck/apply/landing/PR/close confirmation exists.
- AC-009: Direct reads fail closed for forged, malformed, or cross-change iteration artifacts.
- AC-010: Handoff docs record Phase 10D archived, Phase 10E active, and no pending Harness evolution.
