# Spec: Phase 12N Scheduler Terminal Handoff Prompt Evidence

## Goal

When SchedulerRun reaches terminal completion or blocked/exhausted closeout, the main Agent should see the same read-only terminal handoff evidence that the Workpad already shows, so it can explain the current state without inventing a scheduler continuation.

This evidence must remain compact, replayable, freshness-bound to the visible Workpad Goal Loop context, and non-executing.

## Users

- A developer using the Workbench main conversation after scheduler terminal evidence exists.
- A main-Agent `chat.ask` or `orchestrator.plan` run that needs to explain terminal scheduler posture and the next separate human gate.
- Future agents auditing run artifacts and prompt context.

## Acceptance Criteria

- AC-001: `chat.ask` and `orchestrator.plan` include terminal SchedulerRun completion prompt/context evidence only when the Workpad has a matching `schedulerRunCompletion` summary and the visible Goal Loop context is terminal completion / close-gate handoff state.
- AC-002: `chat.ask` and `orchestrator.plan` include terminal blocked-closeout prompt/context evidence only when the Workpad has a matching `schedulerRunBlockedCloseout` summary and the visible Goal Loop context is blocked terminal state.
- AC-003: Compact `context.prepared` evidence carries only terminal kind/status/reason/ids/counts/artifact and false-authority flags; it must not include full scheduler-loop snapshots, markdown, recommended action scopes, worktree id arrays, action payloads, or approval ids.
- AC-004: Terminal handoff evidence does not add or enable Workbench actions and does not enter GoalLoopDecision, iteration, continuation brief, next-step packet, controller policy, or gate-readiness preflight schemas.
- AC-005: Stale or hidden Goal Loop context, missing terminal Workpad summaries, or terminal-state mismatches omit the terminal prompt-stack label and `context.prepared` evidence.

## Non-Goals

- Implementing a scheduler loop, full parallel executor, whole-wave dispatch, slot allocator, worker auto-start, source mutation, apply, close, merge, remote landing, child Change creation, or Harness evolution automation.
- Moving scheduler terminal evidence authority out of SchedulerRun / Workpad projections.
- Creating a second stale-target validation path from scheduler-runtime artifacts into prompt context.
- Changing user-facing Workpad cards beyond what tests require.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution records.
- Terminal prompt evidence is derived from the Workpad projection after Goal Loop packet freshness/parity has already passed.
- The matching terminal handoff condition is stricter than "visible packet plus terminal card":
  - Completion requires a Workpad `schedulerRunCompletion` summary and Goal Loop terminal completion / close-gate handoff state, such as `completionStatus === "ready-for-human-close-gate"` or controlled state `terminal-handoff`.
  - Blocked closeout requires a Workpad `schedulerRunBlockedCloseout` summary and Goal Loop blocked terminal state, such as `completionStatus === "blocked"`.
- All authority flags for loop/full executor/whole-wave/slot/source/apply/close/Harness evolution remain false.

## Risks

- A terminal Workpad card could be attached to stale or non-terminal Goal Loop context if parity is too weak.
- Copying action scopes or worktree arrays into prompt evidence could look like executable authorization.
- Re-reading scheduler-runtime artifacts from prompt code would create a second projection path and weaken stale-target discipline.

