# Plan: Main-Agent Real A-to-A Flow Audit + Repair V1

## Approach

1. Audit references before editing:
   - `desktop-cc-gui` message row rendering, tool/status blocks, ask-user-question dialog, and task/run detail surfaces.
   - Codex Plan Mode / chatwidget approval and Goal continuation patterns.
   - ODWF agent / pipeline / parallel / event / journal boundaries.
2. Trace current AHO product flow:
   - Inspect Workbench projections, planning action handlers, Codex chat bridge, Agent workspace, confirmationQueue projection, and live SSE handling.
   - Run a real app/browser path and record whether the flow actually contains main-agent message, delegation, child-agent lifecycle, child-agent output, and main-agent continuation.
3. Repair the smallest coherent owners:
   - Keep main-agent transcript as parent narrative only.
   - Put planning-agent and child-agent messages/history in the Agent workspace.
   - Keep planning draft interaction in the Agent workspace and implementation handoff through `planning.confirm-execution`.
   - Expose clarification questions in the correct interactive surface.
   - Mark app-server live and replay/fallback distinctly.
4. Add tests around projection, UI routing, and authority boundaries.
5. Run targeted and aggregate verification, then real UI acceptance.

## Reference Findings

- `reference-projects/desktop-cc-gui` is present locally and is the product-layer reference for this repair. The inspected local clone is the authoritative local reference for UI flow checks; do not treat the GitHub suggested path as missing.
- `desktop-cc-gui/src/features/messages/components/MessagesRows.tsx` renders transient working indicators, streaming assistant content, tool/status blocks, and agent-task notification rows as conversation cells. This supports the AHO direction: waiting / connecting / thinking indicators are runtime state, not durable fake assistant prose.
- `desktop-cc-gui/src/features/threads/hooks/useThreadTurnEvents.ts` consumes Codex turn plan updates through `onTurnPlanUpdated` and updates plan state from runtime events instead of manufacturing a static planning card.
- `desktop-cc-gui/src/features/threads/hooks/useThreadUserInput.ts` and `useThreadUserInputEvents.ts` consume Codex runtime `requestUserInput` requests and answer them against the same request id. This means AHO should reuse Codex runtime question events instead of inventing a separate planning questionnaire engine.
- `desktop-cc-gui/openspec/specs/app-server-event-stream-pacing/spec.md` marks `item/tool/requestUserInput`, item completion, and turn completion as critical events that must flush without being dropped. AHO must treat these as live runtime interactions.
- `desktop-cc-gui/openspec/specs/codex-chat-canvas-plan-streaming-contract/spec.md` maps Codex plan streaming to a plan timeline item and uses `turn/plan/updated` only as a compatibility/fallback source. AHO should prefer native `item/plan/delta` / plan item events and keep `<proposed_plan>` parsing as fallback.
- Official Codex app-server docs confirm the item lifecycle as `item/started -> zero or more delta notifications -> item/completed`; plan deltas and runtime user-input requests are first-class app-server events. AHO live acceptance must therefore observe real app-server deltas rather than count `codex exec` replay as live streaming.

## Product Findings

- Main-agent and child-agent output ownership was still mixed: planning output could be projected into the parent conversation or represented as a hand-made summary/card instead of a child-agent transcript.
- The Agent workspace had a custom input/output summary-card UI for child agents. This did not match the center transcript and made the child-agent surface feel like a separate bespoke panel. The repair direction is to reuse transcript cells/process rows and keep child-agent-specific actions local to the child workspace.
- The old planning-agent action surface exposed a manual `planning.generate` button in the Agent workspace. That is not the intended A-to-A flow: the main Agent should delegate to planning-agent, and user feedback should revise an existing draft; implementation still goes through `planning.confirm-execution`.
- The UI used persistent "waiting" text as if it were transcript content. That is not reference behavior; waiting/connecting/thinking is transient runtime state and should not be stored as assistant prose.
- The Codex bridge did not surface app-server `item/tool/requestUserInput` to the Workbench UI, so native runtime clarification/question events were hidden from the user.
- Initial planning-agent delegation needed a bounded main-agent packet. The child prompt must summarize objective, constraints, evidence, and expected output without copying raw user text, full parent transcript, or workspace history.
- Server route tests needed no-op initial planning delegation because they verify HTTP persistence/routing, not real Codex child-agent execution.

## Verification Plan

- Targeted Vitest for Workbench read-model / UI / actions / module boundaries touched by the repair.
- `npm run typecheck`
- `npm run lint`
- `npm run test:workbench`
- `npm run test:fast`
- `npm run build`
- Harness checks: `lint-ecl`, `lint-encoding`, `harness-change reindex`, `harness-evolve check`.
- Real browser acceptance using the normal AHO App and a real project flow.

## Minimality Gate Plan

- Can this be a no-op: no; real UI acceptance showed the current flow still leaks planning/agent output into the wrong surface and lacks reliable child-agent history.
- Reuse: reuse existing topic thread entries, Agent workspace projection, live sinks, Codex chat bridge, planning actions, confirmationQueue, and existing Harness gates.
- Shared root fix: repair role attribution and projection ownership rather than adding local string filters in each UI card.
- Avoided: no second workflow runtime, no new agent controller, no new automation allowlist, no fake Agent transcript.
- Smallest coherent change: add or repair projection metadata and UI routing so existing runtime evidence appears in the right surface.

## Module Boundary Plan

- Owner module: Workbench projections / frontend Agent workspace / Codex chat bridge / planning action handler boundaries as discovered by audit.
- New / moved responsibilities: only projection and display responsibility may move; execution responsibility remains unchanged.
- Facade touch points: Workbench read-model and web DTOs may need backward-compatible optional metadata.
- Forbidden write-back locations: confirmationQueue, action registry, automation allowlist, Scheduler/IntegrationCheck/apply/close owners, worker role packets.
- Compatibility surface: existing topic history and old thread items must still render safely.
- Boundary tests: main transcript exclusion, Agent workspace inclusion, normal composer routing, confirmationQueue planning exclusion, no worker context injection.
- Follow-up split candidates: deeper ordinary Agent mode and multi-provider runtime are out of scope.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: AgentTask/run evidence, topic thread projection, live sinks, Agent workspace, confirmationQueue, `planning.confirm-execution`, current-gate revalidation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: any new metadata must only identify the owning agent for existing messages/process rows; it must not become workflow truth.
- Domain-specific logic location: planning-specific interaction stays in planning action/workspace owners.
- Shared cross-cutting logic location: transcript cell rendering and role-scoped projection helpers.
- Local framework / state machine / projection / validation / gate avoided: no new state machine or gate.
- Future-cost reduction for similar features: role-scoped transcript projection lets coder/validator/auditor reuse the same Agent workspace model.

## Planning-Discovered Gaps

- Real browser acceptance remains pending. Unit/projection/runtime tests prove the ownership and event-routing contracts, but the change must still be validated through normal App UI with real Codex app-server live events before close.
- If app-server live deltas are unavailable in the local runtime, the change must be recorded as blocked or fallback-only for live acceptance; `codex exec` replay cannot be used to claim live streaming parity.
