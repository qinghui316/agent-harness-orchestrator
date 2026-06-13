# Phase 9Q Scheduler IntegrationCheck Handoff

## Purpose

Phase 9Q connects completed scheduler worker outputs back into AHO's existing multi-worktree integration safety chain. It consumes the latest scheduler-owned `SchedulerIntegrationCandidate` with at least two ready worktree targets, revalidates the candidate scope and target evidence, and hands the exact ready worktree ids to the existing explicit `runIntegrationCheck(project, worktreeIds)` path.

This phase does not implement a new IntegrationCheck engine. The existing IntegrationCheck path remains the owner for patch workspace creation, aggregate validation/audit, IntegrationFix attempts, IntegrationCheck result artifacts, and the later human apply gate. Scheduler-owned handoff evidence is bridge/audit material only.

## Scope

In scope:

- Fix handoff drift after Phase 9P close and record Phase 9Q as the active product phase.
- Add scheduler-owned `SchedulerIntegrationCheckHandoff` evidence under `src/scheduler-runtime/`.
- Add a scheduler-scoped Workbench action that requires `changeId + schedulerRunId + schedulerIntegrationCandidateId`.
- Revalidate latest selected Change, SchedulerRun, RuntimeState, latest `SchedulerIntegrationCandidate`, ready target hashes, source heads, and exact worktree ids before calling IntegrationCheck.
- Call existing `runIntegrationCheck(project, exactReadyWorktreeIds)` only with explicit scheduler candidate worktree ids.
- Keep the post-check apply/discard behavior on the existing IntegrationCheck confirmation queue.
- Prevent the ordinary auto-discovered `apply-check.run` candidate from bypassing scheduler-owned handoff evidence for the same scheduler-ready target set.
- Add focused tests for stale/forged/cross-change/not-ready target handling, explicit target handoff, confirmation queue behavior, and module boundaries.

Out of scope:

- No next worker, whole-wave dispatch, scheduler loop, slot allocator, or full parallel executor.
- No validation, audit, rework, new worktree, new coder run, child Change, WorkflowRun, TaskQueueRun, AgentTask, landing, PR, merge, or apply.
- No new IntegrationCheck implementation, patch workspace implementation, aggregate validation/audit implementation, IntegrationFix implementation, apply/discard implementation, CLI command, HTTP route, or product runtime authority.
- No change to IntegrationCheck artifact paths, JSON shape, status semantics, aggregate validation/audit semantics, IntegrationFix semantics, or human apply gate.

## Current Status

Completed.

Planning completed two independent subagent reviews before implementation:

- Review 1: direction is sound; execute after fixing empty ECL artifacts and documenting that `runIntegrationCheck(project, worktreeIds)` creates real IntegrationCheck evidence and may run aggregate validation/audit and IntegrationFix.
- Review 2: current template ECL and STATUS drift are blockers; plan must prevent ordinary auto-discovered IntegrationCheck confirmation from bypassing scheduler-owned handoff evidence and must revalidate candidate target hashes before handoff.

Implemented scheduler-owned IntegrationCheck handoff evidence and Workbench handoff action. Ready scheduler integration candidates now hand off exact worktree ids to the existing IntegrationCheck gate, while ordinary auto IntegrationCheck candidates are suppressed for the same scheduler-owned target set.

## Verification

Completed:

- `rg "Phase 9P is active|Current active phase: Phase 9P|harness/changes/active/phase-9p" AGENTS.md docs`
- `rg "Phase 9Q|Scheduler IntegrationCheck Handoff|SchedulerIntegrationCheckHandoff|integration handoff" AGENTS.md docs harness/changes/active`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench.test.ts` (passed with extended command timeout; test file took about 217 seconds)
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requires every future phase to use two subagent self-evaluations after planning and before execution, then auto-execute when no logic/boundary blocker remains.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
