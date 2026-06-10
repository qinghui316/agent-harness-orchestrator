# Phase 8S Parallel TaskGraph Readiness Scheduler Contract

## Purpose

Phase 8S starts the product capability line after the broad modularization track. It turns confirmed `taskgraph-parallel-candidate` decomposition output into a non-executing, AHO-owned `SchedulerContract` typed artifact so AHO can audit dependency/conflict readiness before any later parallel scheduler exists.

This phase does not start parallel execution. It does not create parallel TaskRuns, WorkerLeases, AgentTasks, WorkflowRuns, worktrees, runs, child Changes, an ODWF JavaScript runtime, or LLM cache/replay behavior.

## Scope

In scope:

- Repair Phase 8R to Phase 8S handoff language.
- Add scheduler-contract readiness status and action boundary.
- Add owned `src/workflow-scheduler/` contract compiler and artifact module.
- Add Workbench action/projection/UI support for compiling and viewing SchedulerContract evidence.
- Preserve sequential TaskQueue / WorkflowGraphPlan behavior.

Out of scope:

- Parallel execution or worker dispatch.
- New runtime start API, CLI command, HTTP route family, SQLite canonical state, child Change creation, ODWF JavaScript runtime, or cache/replay.
- Converting `WorkflowGraphPlan` into a parallel graph.
- Treating SchedulerContract as workflow truth.

## Current Status

Completed.

Phase 8S implemented non-executing SchedulerContract readiness and compile support. Parallel TaskGraph candidates now produce `ready-for-scheduler-contract` / `scheduler.contract`; sequential TaskQueue proposal remains limited to sequential readiness; SchedulerContract compile writes typed artifacts and evidence only.

## Verification

- `rg "Phase 8R is active|Current active phase: Phase 8R|harness/changes/active/phase-8r" AGENTS.md docs` returned no matches.
- `rg "Phase 8S|SchedulerContract|parallel-readiness-v1|ready-for-scheduler-contract|owner module" AGENTS.md docs harness/changes/active` returned expected Phase 8S coverage.
- `npm run test -- tests/unit/workbench.test.ts -t "compiles SchedulerContract from parallel readiness without starting execution"` passed.
- `npm run test -- tests/unit/workflow-actions.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench.test.ts tests/unit/workbench-server.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

