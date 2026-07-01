# Plan: main-agent-old-seam-retirement-v2-action-normalization-bridge

## Approach

Add a small workflow-action normalizer and route only the scattered runtime checks through it. Keep public ids and existing handlers unchanged.

## Steps

1. Add `src/workflow-actions/main-agent-execution.ts` with pure classification helpers for existing `role.pipeline.*` ids.
2. Refactor Workbench workflow action service concurrent-control stop bypass to call `isMainAgentExecutionStopAction`.
3. Refactor action result summary to call `isMainAgentExecutionAction` instead of checking a `role.pipeline.*` prefix.
4. Add unit and boundary coverage proving helper behavior, route compatibility, and no restoration of dead old seams.
5. Run targeted verification, aggregate checks, build, and Harness checks.

## Decisions

- V2 recognizes only existing public `role.pipeline.*` ids. Future `main-agent.execution.*` names are not public, not registered, and not routable in this change.
- The helper lives under `workflow-actions` because it describes action compatibility semantics, not Workbench UI state.
- UI labels may continue to mention the old public ids internally, but user-facing text remains "主 Agent 执行" style.

## Minimality Gate Plan

- Can this be a no-op: no. The current checks are still scattered in runtime service/result code.
- Reuse: existing registry and handlers remain the compatibility surface.
- Shared root fix: centralize classification instead of adding another local string check.
- Avoided: no new state machine, gate, projection, action id, or UI.
- Smallest coherent change: one helper, two runtime call sites, and tests.

## Module Boundary Plan

- Owner module: `src/workflow-actions/main-agent-execution.ts`.
- New / moved responsibilities: pure classification of main-agent execution action ids.
- Facade touch points: Workbench action service and action result summary.
- Forbidden write-back locations: confirmation queue, action registry, action revalidation, automation allowlist, Scheduler, IntegrationCheck, apply/close.
- Compatibility surface: `role.pipeline.*` ids stay public and route through current handlers.
- Boundary tests: source assertions for helper use, live seams retained, dead seams absent.
- Follow-up split candidates: V3 public action-id migration after registry/revalidation/handler compatibility is designed.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: workflow action registry, existing handler dispatch, action summaries, conflict-control stop bypass.
- Why existing mechanisms are insufficient if a new mechanism is proposed: scattered checks make later rename/removal risky; the helper reduces that future cost without changing behavior.
- Domain-specific logic location: main-agent execution action compatibility in `workflow-actions`.
- Shared cross-cutting logic location: the helper is consumed by runtime service/result code.
- Local framework / state machine / projection / validation / gate avoided: yes.
- Future-cost reduction for similar features: later V3 can update one normalizer boundary before touching registry/UI.

## Planning-Discovered Gaps

None.
