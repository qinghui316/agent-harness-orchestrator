# Plan: Phase 10I Goal Loop Next Step Packet Evidence

## Approach

Add a small owner-module artifact after the latest Goal Loop continuation brief. Keep it evidence-only: the packet explains how the next main Agent turn should consume current evidence, but does not execute or expose a new action.

## Steps

1. Fix handoff drift in `AGENTS.md`, `docs/STATUS.md`, and core architecture/runtime/workbench/boundary docs.
2. Add `GoalLoopNextStepPacket` type/schema/path/repository/rendering/compiler support in `src/goal-loop/`.
3. Update `compileGoalLoopEvaluation()` to write the packet after the continuation brief.
4. Extend Workpad goal-loop projection with packet id/summary/authority/separate-gate fields.
5. Add focused tests for packet lineage, projection, non-execution, and module boundaries.
6. Run focused and full verification, then close/archive the change and handle any generated pending evolution.

## Decisions

- The packet is derived evidence, not a new Workbench action.
- The packet may name a recommended action only as a separate Harness gate requirement.
- The packet is not Codex goal runtime; no auto continuation, token accounting authority, or hidden turn scheduling is copied.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New / moved responsibilities: packet schema/type/path/repository/rendering/compile logic.
- Facade touch points: `src/goal-loop/manager.ts` re-exports public packet helpers; Workbench read-model reads packet summary only.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/actions/handlers/*` except no action changes expected, `src/workbench/projections/read-model/confirmation/*`, `src/server/*`, `src/web/src/*`, `src/cli/*`, scheduler runtime modules.
- Compatibility surface: existing Goal Loop action and Workpad shape remain compatible; new optional summary fields are additive.
- Boundary tests: goal-loop unit tests and `workbench-module-boundaries.test.ts`.
- Follow-up split candidates: if future controller work starts, create a separate owner module and do not reuse this packet as execution authority.
- If not applicable, reason: applicable.

## Planning-Discovered Gaps

- `AGENTS.md` still listed Phase 10G as the latest completed product/docs phase after Phase 10H closed. This phase fixes that drift first.
- Subagent review found the prompt/context stack does not yet have a dedicated Goal Loop packet boundary for main-Agent consumption; this phase adds the non-executing packet before any controller work.
