# Phase 10G Goal Loop Continuation Brief Evidence

## Summary

Phase 10G adds a non-executing Goal Loop continuation brief artifact. The brief
is derived from the latest `GoalLoopDecision` and `GoalLoopIteration` and gives
the next main Agent turn a durable evidence-based handoff: what objective is
still active, what evidence was observed, what action may be recommended, what
must stay forbidden, and what must be re-read before continuing.

This phase does not add a Goal Loop controller, hidden continuation turn,
Workbench action, HTTP route, CLI command, UI surface, scheduler loop, worker
start, IntegrationCheck, apply/close path, source mutation, child Change,
Codex goal runtime, or token-accounting runtime.

## Key Changes

- Record Phase 10F as archived and Phase 10G as active in handoff docs.
- Add `GoalLoopContinuationBrief` as an owned `src/goal-loop/` artifact.
- Generate the brief inside the existing `planning.goal-loop.evaluate` flow
  after writing and re-reading the latest `GoalLoopIteration`.
- Keep Workbench handling thin: it records and displays the brief artifact ref,
  but does not own compiler, path, schema, repository, or rendering logic.
- Update docs to state that continuation brief evidence is a prompt/handoff
  artifact, not workflow truth or execution authority.

## Non-Goals

- No new public action, route, CLI API, UI/lazy projection, or artifact shape
  changes outside the additive Goal Loop artifact.
- No automatic continuation, auto-start, worker dispatch, scheduler loop,
  IntegrationCheck, apply, close, landing, PR, merge, or child Change.
- No copy of Codex `goal` runtime locks, idle continuation, active-turn
  scheduling, or token accounting.

## Verification

- Focused unit tests for Goal Loop artifact lineage and Workbench non-execution.
- Module-boundary tests for `src/goal-loop/*`.
- Typecheck, lint, build, Harness lint, encoding lint, reindex, and evolve check.

## Current Status

Completed. Phase 10G adds `GoalLoopContinuationBrief` as a derived,
non-executing Goal Loop handoff artifact, updates Workbench to record/display
the brief artifact ref through the existing `planning.goal-loop.evaluate`
action, and documents the continuation-brief boundary.

Verification passed for focused Goal Loop, workflow action, Workbench fallback,
module-boundary, typecheck, lint, build, encoding, ECL, reindex, and
`harness-evolve check`. Full `npm run test` timed out after 424 seconds with no
failure output; this matches the prior Phase 10F full-suite timeout residual
risk.
