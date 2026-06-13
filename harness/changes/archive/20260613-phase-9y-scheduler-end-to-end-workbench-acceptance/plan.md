# Plan: Phase 9Y Scheduler End to End Workbench Acceptance

## Approach

Use Phase 9Y as an acceptance hardening phase. Prefer tests and local Workbench projection evidence over product changes. If the acceptance exposes a real bug, keep the fix in the owned module responsible for that behavior; do not add scheduler runtime capability or write main implementation back into broad facades.

## Steps

1. Repair handoff drift in `AGENTS.md` and `docs/STATUS.md` so Phase 9X is archived and Phase 9Y is active.
2. Inspect the existing scheduler Workbench acceptance flow and identify the smallest helper/test extension needed to continue through SchedulerRunCompletion.
3. Add applied and discarded terminal acceptance coverage, including cold-read snapshot/projection checks and confirmation queue assertions.
4. Add focused unit coverage for `completed-discarded` if current SchedulerRunCompletion tests only cover applied/idempotent/rejected states.
5. Record UI/user-surface evidence in review notes. Use automated Workbench snapshot/lazy projection evidence if local manual UI acceptance is not practical.
6. Run focused tests, full product verification, Harness lint/reindex/evolution checks, then close and commit.

## Decisions

- Two subagent reviews agreed Phase 9Y should verify acceptance/recovery/confirmation honesty rather than add runtime gates.
- Blocked/exhausted terminal closeout remains a follow-up probe. If 9Y proves it is required, record Phase 9Z instead of expanding 9Y.
- Existing `apply-check.apply` / `apply-check.discard` remains the only source-root IntegrationCheck terminal gate.

## Module Boundary Plan

- Owner module: acceptance coverage is test-owned; minimal product fixes, if required, must stay in the responsible owner module (`src/scheduler-runtime/*`, `src/workbench/projections/read-model/*`, or `src/integration-check/*` depending on the bug).
- New / moved responsibilities: no new runtime responsibilities planned.
- Facade touch points: no public facade behavior should change; existing Workbench action and projection facades may be exercised by tests.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/server/workbench-server.ts`, `src/workbench/projections/read-model.ts`, `src/web/src/App.tsx`, manager facades, and action registry facades must not receive main implementation logic.
- Compatibility surface: existing action payloads, decision/audit scope, IntegrationCheck apply/discard, Workbench projection JSON, SchedulerRunCompletion shape, and SchedulerRun JSON shape remain compatible.
- Boundary tests: Workbench end-to-end acceptance, SchedulerRunCompletion discarded branch, workflow action/confirmation queue consistency if touched, module-boundary tests if files move.
- Follow-up split candidates: none. Potential follow-up product candidate is Phase 9Z blocked/exhausted terminal closeout if 9Y proves a real gap.
- If not applicable, reason: module-boundary planning is applicable because this phase may touch Workbench/scheduler acceptance surfaces.

## Planning-Discovered Gaps

- Phase 9X added terminal completion capability, but end-to-end Workbench acceptance through completion, cold-read projection recovery, and confirmation queue honesty still need explicit coverage.
- The user-facing Workbench surface must prove it does not expose internal scheduler checkpoints as ordinary primary actions after completion.

