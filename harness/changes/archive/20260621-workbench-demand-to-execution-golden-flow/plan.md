# Plan: workbench-demand-to-execution-golden-flow

## Approach

Use a test-first product convergence slice. Start from the existing Workbench action registry and read model, write a bounded golden-flow acceptance test that exercises the front-half manual path, then repair only the real gaps needed for that path. Do not add automation, scheduler loop behavior, or new evidence families.

The acceptance path is:

```text
create demand/topic
-> planning.generate
-> planning.confirm-execution
-> planning.decompose
-> planning.decomposition.confirm
-> planning.decomposition.assess-readiness
-> code.run
-> validation/audit/result evidence
-> existing result.apply / change.close path
```

## Steps

1. Inspect existing Workbench action, server, projection, frontend, and test fixtures for the planning-to-code path.
2. Add or extend a bounded golden-flow test that proves planning confirmation writes canonical artifacts without execution and then exposes decomposition/readiness/code gates in order.
3. Add targeted payload/revalidation tests for missing, stale, forged, and cross-change target ids where current coverage is missing.
4. Add or extend DOM honesty coverage so future-only full-auto/parallel/merge/slot/whole-wave actions are absent from the default surface.
5. Repair product gaps in the smallest owner module that owns the failing behavior.
6. Verify `code.run` uses `runMainAgentToolOrchestration` only after readiness allows it and carries `changeId`, `readinessManifestId`, and task ids.
7. Connect the result evidence to existing validation/audit/result review/apply/close checks without changing the already-proven apply/close boundary.
8. Update active review, summary, and handoff docs; reindex through the Harness script before close.

## Decisions

- This is a new structured product change, not an extension of the closed manual-loop baseline.
- Workbench main UI/action path is the product acceptance surface; CLI and unit tests are supporting evidence.
- `planning.confirm-execution` confirms canonical planning artifacts only. It must not start `code.run`.
- `DecompositionReadinessManifest` remains a guardrail artifact. It authorizes visibility of the next legal action but is not itself executable runtime.
- Direct code execution remains behind `code.run` and existing ToolPolicy/runtime checks.
- Existing manual gates remain final authority for apply, close/archive, remote handoff, and Harness evolution.
- If a gap is too large for this slice, record it as a concrete blocker with a follow-up product slice instead of adding another projection layer.

## Module Boundary Plan

- Owner module: `src/workbench/actions/handlers/*` for planning, decomposition, readiness, and code action behavior.
- Owner module: `src/server/workbench/actions.ts` and existing action revalidation helpers for request forwarding and stale/cross-change rejection.
- Owner module: Workbench read-model / confirmation queue projection modules for visible next-gate selection.
- Owner module: frontend Workbench panels/action payload helpers only if rendered payload or visible honesty is wrong.
- Owner module: code runtime path via `runMainAgentToolOrchestration` for direct code execution; validation/audit/result review/apply/close reuse existing owners.
- New / moved responsibilities: none planned unless tests expose logic currently trapped in a facade.
- Facade touch points: only thin dispatch/compatibility glue may be touched.
- Forbidden write-back locations: no new main logic in `src/workbench/chat.ts`, `src/workbench/manager.ts`, broad read-model facades, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, or runtime manager facades when an owned module exists.
- Compatibility surface: preserve existing action ids, JSON route shape, SSE/live behavior, projection shape, and confirmation queue item shape unless the spec explicitly requires a correction.
- Boundary tests: action/server/read-model/DOM/golden-flow tests named in the verification plan.
- Follow-up split candidates: none identified yet.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench action registry, explicit target ids, server stale revalidation, ToolPolicy/human gates, typed workflow artifacts, `DecompositionReadinessManifest`, `runMainAgentToolOrchestration`, validation/audit evidence, result review, source apply safety, and close/archive handoff.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is currently proposed.
- Domain-specific logic location: Workbench planning/decomposition/code handlers and their existing typed artifact helpers.
- Shared cross-cutting logic location: existing target validation, artifact repository, lineage/hash, read-model, ToolPolicy, validation/audit, and apply owners.
- Local framework / state machine / projection / validation / gate avoided: no new scheduler executor, no local action state machine, no new summary/evidence family, no fake automation gate.
- Future-cost reduction for similar features: a single golden-flow test will make the real Workbench path visible before future automation expands it.

## Planning-Discovered Gaps

Pending implementation inspection.
