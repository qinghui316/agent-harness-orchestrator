# Plan: Phase 9V Scheduler Integration Apply Discard Outcome Acceptance

## Approach

Treat Phase 9V as acceptance plus a narrow owner-module guard fix. The implementation stays in `src/scheduler-runtime/integration-outcome.ts`: before reconciling any IntegrationCheck outcome, re-read the latest `SchedulerIntegrationCandidate` and prove it is the same candidate consumed by the handoff, with the same runtime state, claim reservation, reconcile snapshot, source artifact hashes, ready worktree ids, and ready target evidence.

Workbench acceptance tests then prove the user-facing flow remains simple and safe: after scheduler IntegrationCheck handoff, the right pane uses the existing IntegrationCheck apply/discard confirmation item; only after that existing gate mutates IntegrationCheck state does scheduler outcome reconcile record `applied` or `discarded`.

## Steps

1. Update ECL and docs handoff for Phase 9V.
2. Add latest-candidate alignment guard to scheduler integration outcome reconciliation.
3. Extend outcome unit tests for stale/mismatched latest candidate rejection.
4. Add Workbench acceptance coverage for scheduler IntegrationCheck -> existing apply/discard -> scheduler outcome applied/discarded.
5. Run focused tests, then full product and Harness verification.
6. Update ECL status/review, close change, refresh docs handoff, and commit.

## Decisions

- Do not add a scheduler apply/discard action. Existing `apply-check.apply` and `apply-check.discard` remain the source-root mutation/terminal gate.
- Do not move outcome logic out of `src/scheduler-runtime/integration-outcome.ts`; this is the owner module.
- Do not require manual UI smoke in this phase; use Workbench action/projection tests as the authoritative automated acceptance, and keep manual UI as later end-to-end hardening.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/integration-outcome.ts`.
- New / moved responsibilities: add candidate/handoff/runtime lineage guard for outcome reconciliation; no moved responsibilities.
- Facade touch points: `src/scheduler-runtime/manager.ts` remains a facade export only if touched.
- Forbidden write-back locations: `src/workbench/actions/handlers/planning.ts`, `src/workbench/chat.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, `src/workbench/workflow-projection.ts` must not own outcome state-machine logic.
- Compatibility surface: existing public action `planning.scheduler.integration-outcome.reconcile`, IntegrationCheck apply/discard actions, artifact paths, JSON shapes, and Workbench payloads remain compatible.
- Boundary tests: scheduler outcome unit tests, Workbench acceptance path, module-boundary tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Direct-call gap: Workbench stale revalidation and handoff creation already bind the latest candidate, but `reconcileSchedulerIntegrationOutcome()` itself does not currently re-read latest `SchedulerIntegrationCandidate`. Direct callers should fail closed too.

