# Plan: controlled-scheduler-action-receipt-surface

## Approach

Reuse the existing terminal workflow message path. The backend already computes one `resultSummary`, stores it in the terminal topic thread entry, emits that entry over the live stream, and records it in decision history. The frontend currently drops live `workflow.started/completed/failed` topic messages in `threadItemFromTopicEntry`.

Add a small frontend-owned mapping so live terminal workflow messages become workflow receipt thread items using the same display semantics as snapshot thread projection. Keep started workflow messages hidden unless needed for a live status turn. Do not add new backend action types, new projection owners, or live-only confirmation state.

## Steps

1. Extend the frontend thread entry mapper to render terminal workflow messages as workflow receipt items when `resultSummary`, `text`, or `error` is present.
2. Reuse existing user-facing labels/statuses and `AssistantTurnBlocks` rendering; if no blocks are provided, create no new button-bearing surface.
3. Add/adjust React DOM tests that stream a controlled Scheduler `workflow.completed` message before snapshot and assert the receipt is visible immediately, then replaced by the snapshot without duplicated primary actions.
4. Keep existing controlled Scheduler result summary and right-card tests passing.
5. Run targeted tests and project/Harness verification.

## Decisions

- The live receipt is workflow/evidence UI, not Codex assistant markdown.
- The live receipt is not a source of confirmation actions. Buttons remain owned by the confirmation queue/read model.
- The change is frontend live rendering plus tests only unless verification exposes a backend parity gap.

## Module Boundary Plan

- Owner module: `src/web/src/shell/thread-stream.tsx` owns frontend live topic-entry to thread-item mapping.
- New / moved responsibilities: terminal workflow live receipts for already-emitted topic messages.
- Facade touch points: `src/web/src/App.tsx` continues to call `threadItemFromTopicEntry`; no new app-shell workflow logic should be added beyond that call.
- Forbidden write-back locations: do not add workflow action authority to `App.tsx`, confirmation queue rendering, scheduler handlers, or backend action dispatch for this receipt.
- Compatibility surface: snapshot JSON, live SSE event shape, confirmation queue item shape, and workflow action payloads remain unchanged.
- Boundary tests: React DOM live SSE test plus existing result-summary/right-card tests.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `resultSummary`, controlled-loop summary copy, `TopicThreadEntry`, `ThreadStreamItem`, `AssistantTurnBlocks`, live SSE `topic.message`, snapshot thread projection.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; the gap is that the existing frontend live mapper filters terminal workflow messages.
- Domain-specific logic location: controlled Scheduler copy stays in `src/workbench/user-surface/controlled-loop-results.ts` and `src/workbench/controlled-scheduler-handoff.ts`.
- Shared cross-cutting logic location: generic terminal workflow live mapping stays in the frontend thread-stream shell helper.
- Local framework / state machine / projection / validation / gate avoided: no live-only workflow state machine, no confirmation queue from live state, no new scheduler gate, no duplicate projection builder.
- Future-cost reduction for similar features: future workflow actions that already emit safe `resultSummary` can be visible live without adding action-specific frontend branches.

## Planning-Discovered Gaps

- Plan self-review by subagent `019ee522-a49d-7293-a102-bf6ca97a2304` returned PASS. Required plan correction recorded here: live result summary is a workflow/evidence receipt, not Codex assistant markdown and not a source of confirmation actions.
