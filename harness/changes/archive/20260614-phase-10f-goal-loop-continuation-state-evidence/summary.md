# Phase 10F Goal Loop Continuation State Evidence

## Purpose

Phase 10F adds Goal Loop continuation state evidence to the existing
`GoalLoopIteration` journal. The change records how the main Agent should
interpret the latest loop pass: whether it should wait, recommend an existing
Harness gate, stop as blocked, or explain close readiness.

This is a conservative continuation evidence phase. It does not add a Goal Loop
controller, automatic continuation turn, scheduler loop, worker start, source
mutation, close authority, CLI command, Workbench action, route, or UI surface.

## Scope

In scope:

- Extend `GoalLoopIteration` with evidence-only continuation state,
  control-policy constraints, budget/accounting signal, resume preconditions,
  and optional suppression reasons.
- Keep `planning.goal-loop.evaluate` as the only Workbench entrypoint.
- Update Goal Loop rendering, schemas, repository compatibility, and focused
  tests.
- Update docs handoff from Phase 10E archived to Phase 10F active.

Out of scope:

- New Workbench action, CLI command, HTTP route, frontend surface, or lazy
  projection.
- Autonomous loop controller, scheduler loop, worker start, IntegrationCheck,
  apply, close, source mutation, or child Change creation.
- Codex thread-goal runtime, continuation lock, or token accounting copied into
  AHO.
- A separate canonical `GoalLoopState` artifact that could be mistaken for
  workflow truth.

## Current Status

Ready to close.

## Verification

- `npm run test -- tests/unit/goal-loop-decision.test.ts` passed.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "goal loop"` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed after removing one unused type import.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.
- `npm run test` timed out after 364 seconds with no failure output captured; this
  matches the existing full-suite timeout pattern from recent phases and is
  recorded as residual verification risk, not a focused regression.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: full `npm run test` timed out after 364
  seconds with no failure output captured.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
