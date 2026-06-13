# Plan: Phase 9R Scheduler Integration Outcome Bridge

## Approach

Implement a strict scheduler outcome reconciliation layer after Phase 9Q. The new layer reads scheduler handoff evidence and existing IntegrationCheck state, verifies target lineage, and writes scheduler-owned outcome evidence only when the IntegrationCheck has a terminal or consumed state.

Do not create a scheduler apply/discard action. When the existing IntegrationCheck is `passed`, the user-facing next step remains the existing IntegrationCheck apply/discard confirmation. Phase 9R only bridges scheduler runtime state after that path is applied/discarded or when IntegrationCheck blocks.

## Steps

1. Repair docs/handoff drift for Phase 9R active.
2. Add scheduler-runtime types, schema, paths, repository, renderer, and manager facade export for `SchedulerIntegrationOutcome`.
3. Add strict outcome reconciliation service:
   - Resolve selected Change without legacy active fallback.
   - Read SchedulerRun, RuntimeState, latest SchedulerIntegrationCheckHandoff, and IntegrationCheck.
   - Verify handoff latestness, target ids, source head/hash, integration check id, and result target identity.
   - For `passed`, return a waiting summary without writing duplicate apply evidence.
   - For `applied`, verify target worktree applied state and write applied outcome.
   - For `discarded`, write discarded outcome.
   - For failed/conflict/validation/audit/stale terminal states, write blocked outcome.
4. Add Workbench action/projection glue for outcome reconciliation after terminal/consumed IntegrationCheck states.
5. Add lazy projection for outcome detail and first-screen summary.
6. Add tests for strict scope, idempotency, no duplicate apply controls, and non-execution boundary.
7. Run focused and full verification.

## Decisions

- Keep IntegrationCheck apply/discard as the only source-root mutation authority.
- Do not write scheduler outcome for `passed` unless it has been applied, discarded, or blocked; a dynamic summary can explain "waiting for existing IntegrationCheck apply/discard".
- Use the existing `src/scheduler-runtime/` owner module because this is scheduler runtime accounting, not workflow-scheduler pre-execution planning.
- Treat duplicate or mismatched ready target sets as fail-closed evidence mismatch.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/`.
- New / moved responsibilities: scheduler integration outcome schema/type, artifact path/repository helpers, strict reconciliation, Markdown rendering, and facade export.
- Facade touch points: `src/scheduler-runtime/manager.ts` may re-export public outcome helpers; Workbench action handler/read-model/server/frontend may call owner helpers.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, `src/integration-check/manager.ts`, and `src/workflow-scheduler/manager.ts` must not receive main implementation logic.
- Compatibility surface: existing IntegrationCheck/apply/discard APIs and Workbench confirmation queue shapes remain compatible.
- Boundary tests: module-boundary tests must assert scheduler-runtime modules do not import Workbench/server/web/CLI/broad facades, and behavior tests must assert no duplicate apply action or source-root mutation.
- Follow-up split candidates: none for 9R; later product phases may bridge applied scheduler outcomes into existing landing/PR handoff if needed.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Need verify exact current IntegrationCheck status values and Workbench confirmation behavior before implementation.
- Need decide whether the reconcile action is shown as primary only after applied/discarded/blocked IntegrationCheck states to avoid confusing users with an extra button while `passed` is awaiting apply/discard.
