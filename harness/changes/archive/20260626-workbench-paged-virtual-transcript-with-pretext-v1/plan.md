# Plan: workbench-paged-virtual-transcript-with-pretext-v1

## Approach

Use a narrow, owner-based implementation. Keep the existing transcript builder
as the canonical source-boundary owner. Add a paged view by slicing canonical
cells after build for V1. Add a frontend virtual list owner for rendering only
visible rows. Add a small measurement helper that uses `@chenglou/pretext` for
plain prose estimates and falls back to conservative line-count estimates.

## Steps

1. Add transcript paging DTOs and server route/query support while preserving
   the existing full projection response.
2. Add frontend transcript page loading/cache and switch the conversation tab
   to request the latest page first.
3. Add `TranscriptVirtualList` and `transcriptMeasurement` frontend owners.
4. Fold oversized user/assistant messages before markdown block rendering;
   expand only on explicit user action.
5. Add backend, DOM, and source-boundary tests.
6. Run focused verification, Workbench aggregate, build, and Harness checks.

## Decisions

- V1 slices already-built canonical transcript cells rather than rewriting the
  backend transcript builder to be cursor-aware.
- `pretext` is a measurement dependency only. React DOM and the existing
  `MarkdownLite` remain the rendering path.
- Scroll position and expansion state remain UI-only state.

## Minimality Gate Plan

- Can this be a no-op: no; current `cells.map(...)` renders all rows and cannot
  support very long histories.
- Reuse: preserve `buildParentAgentTranscript`, existing transcript route, and
  `MarkdownLite`; add only the paging/virtualization owners needed for UI scale.
- Shared root fix: root cause is transcript payload/rendering/list layout, not
  workflow state or database behavior.
- Avoided: no central DB, no cursor-aware backend rewrite, no new markdown
  renderer, no copied pretext code, no durable UI state.
- Smallest coherent change: paged canonical-cell slice + virtual list + folding
  + measurement fallback.

## Module Boundary Plan

- Owner module: frontend conversation transcript panel plus small frontend
  transcript virtualization/measurement helpers; server Workbench projection
  route owns paged transcript transport.
- New / moved responsibilities: virtual range calculation, row-height estimates,
  page cache merge, and long-message folding.
- Facade touch points: Workbench projection API and `ConversationPanel.tsx`
  composition only.
- Forbidden write-back locations: do not put main virtualization logic in
  `App.tsx`, Workbench manager facades, or transcript builder authority code.
- Compatibility surface: existing full transcript projection remains available.
- Boundary tests: backend paging tests and App DOM virtualization/source-boundary
  tests.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: canonical parent-agent transcript
  cells, existing lazy transcript projection route, existing `MarkdownLite`, and
  Workbench DOM tests.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  existing renderer has no paging or virtualization boundary.
- Domain-specific logic location: Workbench transcript UI owners.
- Shared cross-cutting logic location: none; this is not workflow authority.
- Local framework / state machine / projection / validation / gate avoided:
  avoided DB, durable cache, new transcript truth, new markdown renderer, and
  backend incremental builder in V1.
- Future-cost reduction for similar features: creates a bounded virtual-list
  owner that can later be reused or extended for transcript-like surfaces.

## Planning-Discovered Gaps

- Backend cursor-aware incremental transcript construction is intentionally
  deferred to V2 if canonical full-transcript build becomes the bottleneck.

