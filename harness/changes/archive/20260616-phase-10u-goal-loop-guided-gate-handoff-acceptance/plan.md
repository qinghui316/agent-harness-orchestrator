# Plan: Phase 10U Goal Loop Guided Gate Handoff Acceptance

## Approach

Add the guided gate handoff at the existing Goal Loop main-Agent context boundary. The context builder already verifies latest decision/iteration/brief/packet freshness, controller-policy lineage, and Workpad-visible parity before `chat.ask` / `orchestrator.plan` see the section. Phase 10U will extend that owned renderer to include a "Concrete Harness Gate Handoff" subsection only when the controller policy has a matching current gate and recommends an existing gate.

The Workbench chat bridge will remain a thin consumer. It may pass through additive metadata into `context.prepared` run events so acceptance tests can prove prompt context and run evidence used the same gate, but it must not create actions or change confirmation queue behavior.

## Steps

1. Update active handoff docs for Phase 10U.
2. Extend `GoalLoopMainAgentContextSection` with optional guided gate action/scope metadata.
3. Render a concrete Harness gate handoff in `src/goal-loop/main-agent-context.ts` only for fresh controller policy with `currentGate`.
4. Pass the guided gate metadata through `chat.ask` and `orchestrator.plan` `context.prepared` event data.
5. Add focused tests around fresh matching and stale/mismatched policy behavior.
6. Run focused and full verification, then close/git if clean.

## Decisions

- Use the existing Goal Loop main-Agent context boundary instead of adding a new Workbench action or UI control.
- Keep controller policy as prompt evidence only; the concrete gate remains the executable confirmation surface.
- Treat event data additions as acceptance evidence, not public API expansion.

## Module Boundary Plan

- Owner module: `src/goal-loop/`.
- New / moved responsibilities: `src/goal-loop/main-agent-context.ts` renders guided gate handoff text and exposes metadata derived from controller policy current gate.
- Facade touch points: `src/workbench/codex-chat/goal-loop-context.ts` and `src/workbench/codex-chat/bridge.ts` consume rendered metadata only.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench action handler map, server route facade, frontend shell, CLI commands, and broad type barrels.
- Compatibility surface: existing `chat.ask`, `orchestrator.plan`, Goal Loop artifacts, Workbench actions, and projections remain compatible.
- Boundary tests: focused `workbench.test.ts` assertions for prompt/context/event handoff plus stale suppression.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

