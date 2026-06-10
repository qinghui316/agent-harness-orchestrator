# Phase 8U Runtime Continuity Contract Foundation

## Purpose

Phase 8U adds the first AHO-owned Runtime Continuity evidence layer after the Phase 8S SchedulerContract and Phase 8T AgentScope reference alignment. It defines scoped `WorkerSession`, `RuntimeWorkspace`, `EventSource`, and `AgentEventEnvelope` artifacts for code-run workers so future parallel scheduler work has session, workspace, event-source, permission-profile, and recovery boundaries before any execution fan-out exists.

This phase is intentionally not a parallel executor. It only records additive run-local runtime continuity evidence for code runs and preserves existing run, Codex event, Workbench, CLI, HTTP, SSE, validation, audit, and workflow-truth behavior.

## Scope

In scope:

- Create `src/runtime-continuity/` as the owner module for schemas/types, paths, repository, guards, and event-envelope helpers.
- Add additive code-run artifacts: `worker-session.json`, `runtime-workspace.json`, `event-source.json`, and `agent-events.jsonl`.
- Integrate Codex app-server and codex exec code-run branches with runtime continuity evidence.
- Guard direct read and append paths against cross-change, cross-run, cross-role, and misplaced evidence.
- Update docs and tests for the Runtime Continuity Layer v1 boundary.

Out of scope:

- Parallel scheduler or parallel executor.
- New TaskRun, WorkerLease, AgentTask, worktree, run, or child Change creation from SchedulerContract.
- New Workbench action, HTTP route, lazy projection, CLI command, UI panel, sandbox backend, permission engine, ODWF JavaScript runtime, or cache/replay behavior.
- Validation/Audit runtime continuity integration.

## Current Status

Completed.

## Verification

- `rg "Phase 8T is active|Current active phase: Phase 8T|harness/changes/active/phase-8t" AGENTS.md docs` -> no matches.
- `rg "Phase 8U|Runtime Continuity|WorkerSession|RuntimeWorkspace|EventSource|AgentEventEnvelope" AGENTS.md docs harness/changes/active` -> matches current handoff/docs/change records.
- `npm run typecheck` -> passed.
- `npm run lint` -> passed after removing an unused type import.
- `npm run test -- tests/unit/runtime-continuity.test.ts tests/unit/workbench-module-boundaries.test.ts` -> passed.
- `npm run test -- tests/integration/cli-flow.test.ts -t "records Codex coder worktree runs"` -> passed.
- `npm run test` -> passed, 24 test files / 328 tests.
- `npm run build` -> passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` -> passed after task/review status update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` -> passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` -> passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` -> passed, no pending evolution.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
