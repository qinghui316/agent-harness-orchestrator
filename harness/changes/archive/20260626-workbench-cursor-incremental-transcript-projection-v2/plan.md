# Plan: workbench-cursor-incremental-transcript-projection-v2

## Approach

Use the existing Workbench SQLite `messages` table and its
`project_id/change_id/position` index as the paging source for default UI
transcript requests. Add a small incremental projection path that maps a page
of `TopicThreadEntry` records into `ParentAgentTranscript` cells with the same
renderer helpers used by the full path.

## Steps

1. Add store/thread-log methods for latest page, before-position page, and count.
2. Add opaque transcript cursor encode/decode and fail-closed parsing.
3. Extract the minimum reusable thread-message-to-transcript conversion helper
   so incremental projection does not duplicate rendering semantics.
4. Add `getWorkbenchTranscriptPageProjection` and wire paged transcript route
   calls to it; keep full projection for no-query compatibility.
5. Change snapshot shell to avoid full `parentAgentTranscript` construction for
   the selected topic.
6. Update frontend/tests only where they rely on full snapshot transcript
   content.
7. Run targeted tests, required checks, and one-time E-drive synthetic pressure
   acceptance; delete pressure data after recording results.

## Decisions

- `totalCount` in incremental pages represents stored thread message count, not
  exact display-cell count. `hasMoreBefore` is the authoritative paging signal.
- Invalid cursor is a bad request instead of silently falling back to latest.
- Incremental default conversation pages do not scan every validation/audit/run
  artifact. Detailed evidence remains in lazy run graph/evidence projections.

## Minimality Gate Plan

- Can this be a no-op: no; V1 pressure proved 50k is fine, but the requested
  100k/500k target requires avoiding server-side full transcript builds.
- Reuse: existing WorkbenchStore, thread-log, parent-agent transcript, server
  projection route, and frontend virtual list.
- Shared root fix: fix the paged transcript route and snapshot shell that still
  force full transcript construction.
- Avoided: no new database, renderer, workflow truth, cache daemon, or durable
  UI state.
- Smallest coherent change: add bounded message paging and an incremental page
  projection while preserving full projection compatibility.

## Module Boundary Plan

- Owner module: existing Workbench store/thread-log/read-model transcript
  projection owners.
- New / moved responsibilities: bounded message page reads and incremental
  transcript page construction.
- Facade touch points: Workbench projection route selects incremental vs full
  path based on query parameters.
- Forbidden write-back locations: no workflow artifacts, source roots, ECL
  archive records outside this active change, or durable UI state.
- Compatibility surface: existing transcript JSON remains compatible; full path
  remains available without paging params.
- Boundary tests: store paging, route paging, snapshot shell, virtual list.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: SQLite WorkbenchStore message
  log, thread-log import/read path, `ParentAgentTranscript` cells, frontend
  virtual list, Pretext fallback.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed; V2 strengthens existing paging source.
- Domain-specific logic location: transcript projection/read-model modules.
- Shared cross-cutting logic location: `WorkbenchStore` and thread-log paging.
- Local framework / state machine / projection / validation / gate avoided: no
  new workflow/projection framework or permission gate.
- Future-cost reduction for similar features: later transcript compaction can
  build on the same cursor/page boundary.

## Planning-Discovered Gaps

None yet.
