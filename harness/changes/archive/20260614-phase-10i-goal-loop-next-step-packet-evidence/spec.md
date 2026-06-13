# Spec: Phase 10I Goal Loop Next Step Packet Evidence

## Goal

Create a scoped `GoalLoopNextStepPacket` evidence artifact that lets the main Agent resume a long-running Goal/Change from current evidence without copying Codex goal runtime behavior. The packet must remain non-executing and must make clear that any recommended action is a separate existing Harness gate.

## Users

- Main Agent: reads a compact packet before explaining or recommending the next step.
- User: sees a safer Workpad summary that distinguishes evidence from execution authority.
- Future contributors: get a durable boundary between Goal Loop context and scheduler/runtime execution.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 10H archived and Phase 10I active, with no stale Phase 10H/10G latest-active claims.
- AC-002: `src/goal-loop/` owns `GoalLoopNextStepPacket` type/schema/path/repository/rendering/compile logic.
- AC-003: The packet is derived from latest matching `GoalLoopDecision + GoalLoopIteration + GoalLoopContinuationBrief`.
- AC-004: Cross-change, malformed, missing, or mismatched Goal Loop lineage fails closed or is omitted from projection paths.
- AC-005: Packet authority is explicitly non-executing and `executionStarted` remains `false`.
- AC-006: Packet records recommended action metadata only as a separate Harness gate requirement; it does not create a queue item or `workpad.nextAction`.
- AC-007: Workpad read-model may display packet summary, but no action/route/CLI/UI execution surface is added.
- AC-008: No worker, TaskRun, WorkerLease, WorkerSession, RuntimeWorkspace, EventSource, worktree, run, validation, audit, IntegrationCheck, apply, close, landing, PR, merge, child Change, scheduler loop, or slot allocator is created.
- AC-009: New owner-module code does not depend on Workbench, server, web UI, CLI command modules, or broad facades.
- AC-010: Verification passes, or pre-existing failures are recorded.

## Non-Goals

- Implementing a Goal Loop controller.
- Implementing Codex hidden continuation scheduling, continuation locks, active-turn reservation, or token accounting runtime.
- Replacing Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, or Harness evolution as workflow truth.

## Constraints

- `README.md` remains unrelated and untracked.
- Future feature module-boundary rule applies: new main logic belongs in `src/goal-loop/`, not Workbench handler/projection facades.
- Workbench projection must stay projection-safe; bad packet evidence must not crash the first screen.

## Risks

- A packet could be misread as execution authorization. Mitigation: type authority, Markdown text, Workpad fields, docs, and tests all state non-execution.
- A stale recommendation could mislead the main Agent. Mitigation: packet carries staleness and separate-gate revalidation instructions; future phases may add stricter current-confirmation freshness matching before any controller work.
