# Spec: workbench-cursor-incremental-transcript-projection-v2

## Goal

Default Workbench conversation reads should stay responsive when a single
demand conversation grows from tens of thousands to hundreds of thousands of
messages. Paged transcript API calls must avoid full transcript construction
and return only the requested page.

## Users

- Local personal Workbench users who keep one demand conversation open for a
  long time.
- Agents and maintainers who need the same transcript source-boundary semantics
  without paying full-build cost on every page request.

## Acceptance Criteria

- AC-001: Paged transcript API calls read a bounded message page from the
  existing Workbench SQLite store instead of building the full selected-topic
  transcript first.
- AC-002: Latest page and `beforeCursor` page responses preserve message order,
  stable cell ids, `hasMoreBefore`, `nextBeforeCursor`, and total count.
- AC-003: Invalid or forged cursors fail closed with a clear request error.
- AC-004: Full transcript projection remains available for compatibility when
  no paging query is supplied.
- AC-005: Workbench snapshot shell no longer constructs the full
  `parentAgentTranscript` for the selected topic by default.
- AC-006: Frontend virtual transcript behavior remains compatible with opaque
  cursors, page merge, long-message folding, and Pretext fallback.
- AC-007: One-time synthetic pressure evidence covers 100k and 500k messages
  without Codex token use or durable large fixtures.

## Non-Goals

- Do not add a central workflow database.
- Do not change workflow truth, source mutation, validation/audit, apply,
  landing, close, Goal Loop, scheduler, automation, or Harness evolution.
- Do not persist scroll position, expanded row state, or measurement caches.
- Do not implement conversation compaction or archive-window policy.

## Constraints

- SQLite remains an interaction/projection store only.
- Pretext remains a frontend height-estimation dependency only.
- New code must reuse existing transcript/thread-log/projection owners rather
  than adding a parallel transcript renderer.
- `README.md` remains unrelated and untracked.

## Risks

- Incremental projection may omit full-build-only derived evidence rows if it
  tries to avoid scanning all run/validation/audit artifacts. V2 should keep
  default conversation source-boundary honest and leave details in run graph /
  evidence projections.
- Existing DOM tests may assume snapshot contains a full transcript; those tests
  should move to the paged route where appropriate.
