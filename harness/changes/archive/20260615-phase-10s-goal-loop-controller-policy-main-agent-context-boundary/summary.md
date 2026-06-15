# Phase 10S Goal Loop Controller Policy Main Agent Context Boundary

## Purpose

Phase 10S connects the latest valid `GoalLoopControllerPolicy` from Phase 10R into main-Agent prompt context. The policy already exists as non-executing evidence and is visible in Workpad projections; this change makes the main Agent see the same controller verdict, gate status, and summary when continuing a selected Change.

This is a context boundary fix, not a new runtime. It does not add Workbench actions, routes, CLI commands, UI controls, scheduler execution, worker execution, source mutation, child Changes, or workflow-truth authority.

## Scope

In scope:

- Extend `src/goal-loop/main-agent-context.ts` to read and render latest valid `GoalLoopControllerPolicy` alongside the current `GoalLoopNextStepPacket`.
- Preserve strict Change / decision / iteration / brief / packet lineage and `executionStarted === false` checks.
- Keep Workbench visible-context filtering aligned with the selected Workpad's current packet and policy projection.
- Add focused tests for valid policy injection and stale or mismatched policy suppression.
- Update docs and ECL artifacts to record Phase 10S as a prompt-context boundary.

Out of scope:

- New Workbench actions, HTTP routes, CLI commands, frontend controls, lazy projections, or confirmation queue behavior.
- Executing or confirming any recommended action from the controller policy.
- Scheduler workers, validation, audit, IntegrationCheck, apply, close, landing, PR, merge, child Changes, worktrees, runs, or source-root mutation.
- Injecting controller policy into coder / validator / auditor worker prompts.

## Current Status

Ready to close.

## Verification

- `npm run test -- tests/unit/goal-loop-decision.test.ts` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "goal loop"` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` pending final ECL update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` pending final ECL update.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly allowed subagent review; two read-only subagents confirmed Phase 10S is a valid next step if kept to prompt context only.
- Retries or environment failures: `tests/unit/workbench.test.ts` exceeded an early 120s/300s tool window when run alone; the same file passed during full `npm run test`.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: no source mutation intended.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
