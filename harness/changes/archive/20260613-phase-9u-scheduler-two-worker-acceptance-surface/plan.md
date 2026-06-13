# Plan: Phase 9U Scheduler Two Worker Acceptance Surface

## Approach

Use Phase 9U as an acceptance/boundary pass, not a new runtime feature. First update ECL/docs to declare the active phase. Then fix the residual transcript label drift from `first worker` to `current worker`. Finally add a real Workbench action-flow test that drives the second scheduler worker through the existing current-worker gates and proves the refreshed candidate can hand off to the existing IntegrationCheck path.

## Steps

1. Record current state and subagent review findings in ECL.
2. Update `AGENTS.md` and status/runtime/workbench/boundary docs for Phase 9U.
3. Fix residual scheduler worker transcript labels in the read-model thread stream.
4. Add focused tests for worker-path helper coverage and the two-worker happy path through candidate refresh and IntegrationCheck handoff.
5. Run focused tests plus full product/Harness verification.
6. Close the ECL change and commit, excluding unrelated `README.md`.

## Decisions

- Do not add new action ids; use the existing `start-next`, current worker quality gates, candidate refresh, and IntegrationCheck handoff paths.
- Do not move core scheduler state logic into Workbench. If a behavior fix is required, prefer `src/scheduler-runtime/*` owner helpers.
- Treat labels as product behavior because the main-agent conversation is the user's primary understanding surface.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/` owns scheduler worker path decisions; `src/workbench/projections/read-model/thread-stream.ts` owns transcript labels only.
- New / moved responsibilities: no new runtime responsibility; acceptance tests cover existing two-worker action path.
- Facade touch points: none expected beyond existing Workbench projection/action surfaces.
- Forbidden write-back locations: do not add scheduler domain decisions to `src/workbench/chat.ts`, server facade, frontend shell, or broad manager facades.
- Compatibility surface: existing Workbench action ids and payload shapes remain unchanged.
- Boundary tests: `tests/unit/workbench.test.ts` and `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: Workbench worker-path status classification may later move further into scheduler-runtime if acceptance work exposes drift, but 9U does not broaden that refactor.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent logic review found no blocking design issue and recommended a two-worker happy path acceptance phase before adding executor/loop behavior.
- Subagent module review warned not to duplicate scheduler state-machine logic in Workbench; this phase should favor tests and minimal copy fixes.
