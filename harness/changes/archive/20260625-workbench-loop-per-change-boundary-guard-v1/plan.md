# Plan: workbench-loop-per-change-boundary-guard-v1

## Approach

Patch the existing execution boundary owners. The reference pattern is not a new framework: Open Dynamic Workflows binds leaf results to a single workflow run/journal, and Symphony binds execution workspaces to a single issue/orchestrator record. AHO should bind worker worktrees and IntegrationCheck to one Change and let later loops create new Changes.

## Steps

1. Update IntegrationCheck candidate collection so ready targets are grouped by `changeId`.
2. Enforce same-Change targets inside explicit `collectReadyTargets` / `runIntegrationCheck` paths.
3. Scope Workbench IntegrationCheck candidate projection to the selected Change.
4. Add runtime self-guards in `automation-runtime` and `goal-loop-runtime` before child dispatch.
5. Correct slow Workbench integration tests from cross-demand success to same-Change success plus cross-Change fail-closed.
6. Add targeted runtime tests for cross-Change child gates.
7. Verify archived follow-up and maintenance closeout behavior with existing targeted tests.
8. Update review, handoff docs, close, and git settle if verification passes.

## Decisions

- `findIntegrationCheckCandidate(project, changeId?)` may choose a same-Change group. In Workbench, selected topic passes `changeId`, so the primary surface cannot mix Changes.
- `runIntegrationCheck(project, worktreeIds?)` remains the execution owner, but target collection now rejects more than one `changeId`.
- Scoped automation and Goal Loop runtime fail closed with existing stale-target stop reasons when child gates point outside the authorized Change.
- Archived/follow-up and maintenance threshold behavior already have owners; add or reuse targeted tests rather than new runtime code unless tests reveal a real gap.

## Minimality Gate Plan

- Can this be a no-op: no. Current IntegrationCheck candidate code collects project-wide ready targets and existing tests expect cross-demand success.
- Reuse: `integration-check/candidates.ts`, Workbench confirmation projection, `automation-runtime/runner.ts`, `goal-loop-runtime/runner.ts`, conversation lifecycle tests, and maintenance review identity.
- Shared root fix: candidate collection and runtime child dispatch are shared paths; fixing only UI copy would leave API/server paths unsafe.
- Avoided: no child Change framework, no new permission registry, no scheduler executor, no new memory/evidence layer.
- Smallest coherent change: add same-Change grouping/guards and adjust tests that encode the old behavior.

## Module Boundary Plan

- Owner module: `src/integration-check/candidates.ts` owns candidate target eligibility; `src/workbench/projections/read-model/confirmation-queue.ts` owns selected-topic projection; `src/automation-runtime/runner.ts` and `src/goal-loop-runtime/runner.ts` own runtime self-guards.
- New / moved responsibilities: none.
- Facade touch points: no broad facade logic should be added; manager exports stay compatibility-only.
- Forbidden write-back locations: no reference projects, no generated index hand edits, no unrelated `README.md`.
- Compatibility surface: public function `findIntegrationCheckCandidate` gains an optional `changeId` filter; existing callers remain compatible.
- Boundary tests: IntegrationCheck same/cross Change, runtime cross-Change child gate, archived follow-up, maintenance threshold.
- Follow-up split candidates: higher-level cross-Change merge/landing design, if product later needs it.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: worktree gate readiness, IntegrationCheck target collection, confirmation queue, current runtime authorization ids, stale-target stop reasons, conversation lifecycle, closeout review keys.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: IntegrationCheck target grouping stays in IntegrationCheck owner; selected-topic projection stays in Workbench read model.
- Shared cross-cutting logic location: runtime Change self-guards stay in runtime runners where child dispatch is centralized.
- Local framework / state machine / projection / validation / gate avoided: no parallel gate/projection/permission system.
- Future-cost reduction for similar features: future multi-worktree execution can rely on a single parent-Change invariant instead of rechecking every integration caller locally.

## Planning-Discovered Gaps

- Existing slow Workbench integration tests still encode old cross-demand IntegrationCheck success and must be updated.
