# Plan: Phase 10L Goal Loop Packet Freshness Confirmation Alignment

## Approach

Add a small read-only freshness layer inside `src/goal-loop/`. It will compare the latest packet against a non-writing preview of current Goal Loop decision evidence. Main-Agent context and Workbench projection will only expose the packet when the recommendation and source-evidence snapshot still align.

## Steps

1. Update handoff docs for Phase 10L active.
2. Add non-writing current decision preview support in `src/goal-loop/compiler.ts`.
3. Add `src/goal-loop/freshness.ts` to compare packet recommendation scope and source evidence against the current preview.
4. Gate `buildGoalLoopMainAgentContextSection()` and Workbench `readLatestGoalLoopSummary()` through the freshness helper.
5. Add tests for fresh packet rendering and stale packet suppression after scheduler evidence advances.
6. Run focused product and Harness verification, then close/git.

## Decisions

- Use read-only preview rather than recompiling/writing a fresh packet during projection or prompt construction.
- Treat mismatch as stale and skip the packet. The next explicit `planning.goal-loop.evaluate` can write a fresh packet.
- Do not compare against UI confirmation queue directly in this phase; the current Goal Loop preview is the canonical policy snapshot and concrete gates still perform their own stale revalidation.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New / moved responsibilities: packet freshness and recommendation alignment.
- Facade touch points: `src/goal-loop/manager.ts` may re-export helpers if needed; Workbench projection/chat only call the owner helper.
- Forbidden write-back locations: Workbench action handlers, chat facade policy, server routes, web UI, CLI modules, scheduler-runtime modules.
- Compatibility surface: existing Goal Loop artifacts and Workbench action shapes remain unchanged.
- Boundary tests: `tests/unit/goal-loop-decision.test.ts`, `tests/unit/workbench-module-boundaries.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

Subagent reviews found stale packet injection risk in main-Agent context and Workpad summary. This phase addresses that before any Goal Loop controller or auto loop.

