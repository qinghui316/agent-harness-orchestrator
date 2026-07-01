# Plan: main-agent-workflowgraph-replay-consumption-roadmap-sync-v1

## Approach

Add a small main-agent orchestration helper that composes the existing graph observation writer with the existing replay summary builder. Replace production observation-only call sites in planning and TaskQueue lifecycle with this helper, but do not use the returned replay summary to branch, execute, display, or persist anything.

Then update the roadmap / handoff docs to reflect that role step loop, TaskRun lifecycle, queue step loop, WorkflowGraph observation, replay summary, and decision policy are already implemented.

## Steps

1. Add `recordMainAgentWorkflowGraphObservationAndReplay(...)` in the main-agent orchestration owner.
2. Export the helper from the main-agent orchestration barrel.
3. Replace graph observation calls in planning milestone handlers and TaskQueue lifecycle terminal observation with the helper.
4. Add unit / boundary tests for helper return shape, no persistent replay artifact, no execution side effects, and no forbidden imports.
5. Update `docs/CURRENT-DEVELOPMENT-PLAN.md`, `docs/STATUS.md`, and current handoff pointers as needed.
6. Run targeted tests, aggregate checks, and Harness checks.

## Decisions

- Helper location: a small new owner file under `src/main-agent-orchestration/` to avoid circular imports between observation and replay modules.
- Replay output use: returned for future internal consumers and tests only; ignored by current production handlers.
- Documentation scope: update roadmap/current handoff only, not historical archive summaries unless lint requires it.

## Minimality Gate Plan

- Can this be a no-op: no; replay summary currently has no production consumer and roadmap/current-state docs have drift.
- Reuse: reuse existing WorkflowGraph observation evidence, replay summary builder, and decision policy.
- Shared root fix: use one helper rather than repeating record+replay at each caller.
- Avoided: no UI, action path, prompt context, scheduler integration, or new durable replay artifact.
- Smallest coherent change: one helper, limited call-site replacement, tests, and docs.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/`.
- New / moved responsibilities: helper owns the composition of graph observation evidence plus replay summary construction.
- Facade touch points: `src/main-agent-orchestration/index.ts` exports the helper.
- Forbidden write-back locations: Workbench UI, confirmation queue, workflow action handlers, scheduler runtime, terminal, apply/close modules, automation allowlist, SQLite, and replay artifact files.
- Compatibility surface: existing graph observation and replay APIs remain available.
- Boundary tests: module-boundary tests check helper/replay/policy forbidden imports and old-entrypoint absence.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `recordMainAgentWorkflowGraphObservation`, `buildMainAgentWorkflowGraphReplaySummary`, and `evaluateMainAgentWorkflowGraphReplayPolicy`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: callers need one safe owner to consume replay without scattering policy-shaped logic.
- Domain-specific logic location: graph observation stays in `workflowgraph-observation`; replay aggregation stays in `workflowgraph-replay`; policy stays in `decision-policy`.
- Shared cross-cutting logic location: the new helper composes those owners only.
- Local framework / state machine / projection / validation / gate avoided: no new state machine, gate, projection table, or validation layer.
- Future-cost reduction for similar features: future Policy V2 / recovery consumers can depend on one standard replay consumption seam.

## Planning-Discovered Gaps

- Subagent Plato found current-state doc drift in `docs/STATUS.md` and emphasized that `continue-queue-step-loop` must remain non-executing.
