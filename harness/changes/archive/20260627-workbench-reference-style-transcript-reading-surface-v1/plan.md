# Plan: workbench-reference-style-transcript-reading-surface-v1

## Approach

Keep the canonical transcript pipeline unchanged and refactor only the React presentation layer. Extract transcript cell rendering and MarkdownLite into a small Workbench owner, update activity-row expansion to share the existing `expandedCells` state, and tune CSS/height estimation to match the reference project's reading hierarchy.

## Steps

1. Fill active change acceptance criteria and reference/minimality notes.
2. Inspect current transcript renderer and `desktop-cc-gui` message/tool-block presentation evidence.
3. Extract user/assistant/activity/MarkdownLite components from `ConversationPanel.tsx`.
4. Update virtual-list height estimation for collapsed/expanded activity rows.
5. Polish CSS for right-aligned user bubbles, transparent assistant reading flow, compact expandable activity rows, and MarkdownLite headings/lists/blockquotes/code labels.
6. Add/update DOM tests for rendering classes, activity expansion, MarkdownLite coverage, long-message folding, and bounded virtual rows.
7. Run targeted and required verification, then record review/summary evidence.

## Decisions

- Activity rows remain individual transcript cells in V1; grouping consecutive tool rows is intentionally deferred because it would alter cell identity and virtual-list cursor assumptions.
- Expansion state stays frontend-only in `expandedCells`; it does not write to SQLite, Workpad, memory, or workflow artifacts.
- MarkdownLite stays a tiny renderer for prose readability; no mermaid/math/table/runtime plugin support.

## Minimality Gate Plan

- Can this be a no-op: no; the user-facing complaint is the current transcript reading surface.
- Reuse: keep `ParentAgentTranscriptCell`, cursor paging, virtual range calculation, Pretext measurement, and long folding.
- Shared root fix: the issue is presentation in `ConversationPanel.tsx`/styles, not backend projection or workflow state.
- Avoided: no new transcript datasource, markdown runtime, projection system, action path, or database.
- Smallest coherent change: one extracted display component module, measurement tweak, CSS, and targeted DOM coverage.

## Module Boundary Plan

- Owner module: Workbench transcript presentation under `src/web/src/panels/workbench/`.
- New / moved responsibilities: cell presentation and MarkdownLite rendering move out of `ConversationPanel.tsx`.
- Facade touch points: `ConversationPanel.tsx` continues to own tab layout, transcript paging, and virtual range state.
- Forbidden write-back locations: no backend, SQLite, Harness memory, workflow action, or source mutation writes.
- Compatibility surface: existing transcript test ids and `.parent-agent-tool-result` selectors remain available.
- Boundary tests: DOM tests in `tests/unit/web-app.test.tsx`.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: transcript cell projection, virtual list, Pretext measurement, long-message folding, evidence ref labeling.
- Why existing mechanisms are insufficient if a new mechanism is proposed: only a small presentation module is needed because the existing inline renderer is too large and hard to evolve.
- Domain-specific logic location: message/activity visual rendering in the new transcript surface component.
- Shared cross-cutting logic location: height estimates remain in `transcriptMeasurement.ts`.
- Local framework / state machine / projection / validation / gate avoided: no new workflow, permission, projection, renderer runtime, or state machine.
- Future-cost reduction for similar features: future transcript polish can touch the display owner without modifying Workbench tab or action logic.

## Planning-Discovered Gaps

None yet.
