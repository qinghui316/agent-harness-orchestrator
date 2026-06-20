# Plan: Workbench Controlled Loop Result Surface

## Approach

Treat this as one product-facing Workbench slice: the user confirmed a controlled continuation, so every primary surface after that confirmation should describe the result in the same language. Keep runtime and evidence generation unchanged, and add a small shared copy boundary for post-run/result/thread/handler summaries.

## Steps

1. Add a Workbench user-surface helper for controlled-loop result labels, summaries, thread fallback text, and handler message text.
2. Wire `src/workbench/actions/results.ts` to use the helper for controlled Scheduler step/advance and Goal Loop evaluate/feedback/controller/preflight labels and summaries.
3. Wire `src/workbench/projections/read-model/thread-stream.ts` to use the helper for workflow started/completed/failed fallback labels and bodies.
4. Update `src/workbench/actions/handlers/goal-loop.ts` so conversation-visible assistant messages use short user-facing summaries while preserving artifact refs to the detailed Markdown evidence.
5. Align frontend action labels only where the current visible label still exposes obvious internal Goal Loop mechanics.
6. Add focused tests for result copy, thread fallback copy, and an actual Goal Loop thread message path.
7. Run targeted tests, product checks, Harness checks, independent close-ready review, then close and commit if clean.

## Decisions

- The detailed Goal Loop Markdown renderers remain evidence/artifact renderers. They are no longer reused as primary chat text for this Workbench slice.
- The helper owns presentation copy only. It must not read/write memory, authorize actions, revalidate targets, or inspect runtime state.
- Scheduler labels should reuse the existing scheduler user-surface copy owner instead of duplicating scheduler action naming.

## Module Boundary Plan

- Owner module: Workbench user-surface/action/projection layer.
- New / moved responsibilities: add controlled-loop primary-surface copy helper for result summaries, thread fallback, and handler messages.
- Facade touch points: none expected; manager/facade exports stay unchanged unless compilation requires a narrow export.
- Forbidden write-back locations: `src/goal-loop` evidence compilation/rendering semantics, `src/workflow-scheduler`, `src/scheduler-runtime`, ToolPolicy/action dispatch, integration/apply, and Harness evolution automation.
- Compatibility surface: action types, result payloads, artifact refs, and Workbench read-model shapes remain compatible.
- Boundary tests: focused unit tests assert user-facing primary copy and absence of raw internal terms on touched surfaces.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing action result summarization, read-model thread projection, Goal Loop handlers, and scheduler user-surface copy.
- Why existing mechanisms are insufficient if a new mechanism is proposed: current copy is duplicated across result, projection, and handler paths; a small helper is needed to prevent drift while preserving existing mechanics.
- Domain-specific logic location: Goal Loop/Scheduler runtime facts stay in their owners; the helper only maps known Workbench action types to primary-surface text.
- Shared cross-cutting logic location: Workbench user-surface copy helper.
- Local framework / state machine / projection / validation / gate avoided: no new state machine, gate protocol, execution path, artifact protocol, or validation framework.
- Future-cost reduction for similar features: future controlled-loop actions can add primary-surface copy once instead of patching result summaries, thread fallback, and handler messages separately.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Plan review found the first draft only covered action results and thread fallback. Scope now also includes Goal Loop handler assistant messages so primary conversation text does not expose internal Markdown evidence titles.
- UI DOM coverage is expected to be unnecessary if read-model projection tests prove the visible data contract; review must record this rationale.

