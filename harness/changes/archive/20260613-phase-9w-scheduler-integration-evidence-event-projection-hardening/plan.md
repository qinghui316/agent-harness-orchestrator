# Plan: Phase 9W Scheduler Integration Evidence Event Projection Hardening

## Approach

Keep this as a narrow scheduler-runtime hardening phase. Add integration bridge event types to the existing SchedulerRun event journal and append them from the existing owner modules after successful artifact writes. Do not add new user actions or execution behavior.

Two independent reviews agreed 9W is the right next step before more executor work:

- Dalton: scheduler integration candidate/handoff/outcome exist as artifacts, but runtime event/recovery coverage stops at worker/rework/audit. Add event/projection coverage before more worker loop work.
- Anscombe: 9W is observability + recovery/replay hardening, not execution; owner module should remain `src/scheduler-runtime/`.

## Steps

1. Fill ECL artifacts and record pre-implementation status.
2. Update handoff docs for Phase 9W active.
3. Extend scheduler runtime event types/schemas.
4. Append events from integration candidate, handoff, and terminal outcome owner modules.
5. Add focused tests for event writes, waiting/no-terminal behavior, existing handoff idempotence, and module boundaries.
6. Run focused product verification, full product verification, and Harness verification.
7. Close the change, handle any pending evolution, and commit.

## Decisions

- Event names:
  - `scheduler-runtime.integration-candidate-compiled`
  - `scheduler-runtime.integration-check-handoff-completed`
  - `scheduler-runtime.integration-outcome-recorded`
- `waiting-for-apply` remains a returned summary, not a terminal outcome event, because no scheduler outcome artifact is written yet.
- Returning an existing handoff/outcome should not append another event.
- Candidate compile currently rewrites the latest deterministic artifact; event append should represent a compile/refresh write and include candidate status/counts.

## Module Boundary Plan

- Owner module: `src/scheduler-runtime/`.
- New / moved responsibilities: scheduler integration event typing and append calls for candidate/handoff/outcome evidence.
- Facade touch points: `src/scheduler-runtime/manager.ts` remains a re-export facade only.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench action handler facades, Workbench projection facades, server routes, frontend shell, CLI command modules, IntegrationCheck engine, apply/discard modules.
- Compatibility surface: existing scheduler integration functions and artifacts remain compatible.
- Boundary tests: module-boundary tests plus focused scheduler integration event tests.
- Follow-up split candidates: none for this phase; later executor work must remain separate.
- If not applicable, reason: applicable.

## Planning-Discovered Gaps

- `SchedulerRuntimeEventType` currently ends at worker/rework audit events and does not include integration candidate/handoff/outcome transitions.
- Existing integration artifacts are readable via lazy projections, but the SchedulerRun event stream does not show the integration bridge in order.
- The handoff result field `executionStarted: false` is semantically scheduler-execution false, not IntegrationCheck false. Keep behavior unchanged; avoid widening this phase.
