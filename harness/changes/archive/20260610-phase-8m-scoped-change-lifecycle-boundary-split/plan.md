# Plan: Phase 8M Scoped Change Lifecycle Boundary Split

## Approach

1. Repair handoff drift after Phase 8L close.
2. Introduce shared Change metadata schema and guards.
3. Move existing Change manager responsibilities into owned modules while
   preserving the `src/change/manager.ts` facade.
4. Update Workbench topic/read-model/thread-log/topic-resolver metadata reads to
   use the shared guard where scope matters.
5. Add focused boundary tests, then run full product and Harness verification.

## Module Boundaries

- `schemas/types`: Change metadata schema and public result types.
- `paths`: required files, path helpers, display/archive path helpers.
- `metadata`: scoped metadata reading and state/path validation.
- `templates`: template root lookup and initial file rendering.
- `repository`: low-level metadata/content reads and writes.
- `creation`: `createChange()` and `createConcurrentChange()`.
- `status`: `getChangeStatus()` and `getChangeStatusForChange()`.
- `close-gate`: close-gate composition helpers.
- `lifecycle`: close/abandon lifecycle.
- `guards`: reusable fail-closed assertions.

`manager.ts` should only re-export compatibility symbols.

## Scope Guard Semantics

- Active/parking strict path: `item.name` and final directory segment must equal
  `change.json.id`, and metadata state must be `active`.
- Archive strict path: metadata state must be `archived`; `archivePath` must
  match the current relative path when present.
- Workbench projection may omit or fallback for invalid metadata, but must not
  display forged metadata id/title as the selected topic.
- Status/close/abandon are strict and produce blocking issues or throw errors.

## Risks

- Workbench topic projection has its own metadata reader; it must be migrated or
  the guard will be incomplete.
- Thread-log import uses metadata id; it must not trust malformed active
  metadata.
- Archive lookup relies on metadata id; preserve valid archived lookup while
  rejecting inconsistent archive metadata.
