# Spec: Phase 8M Scoped Change Lifecycle Boundary Split

## Problem

`src/change/manager.ts` still mixes Change creation, status/close-gate
evaluation, metadata parsing, template rendering, close/abandon lifecycle, and
helper logic. The core manager is now one of the remaining large domain files.

There is also a scoped boundary gap: several paths trust `change.json.id`
without validating it against the Change directory/index item. A misplaced or
forged metadata file must not let Workbench show the wrong selected demand,
import thread messages under the wrong topic id, or close/archive the wrong
Change.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8L closed and Phase 8M active, with no
  stale Phase 8L active claim.
- AC-002: Active and parking Change metadata must match the directory name and
  expected state.
- AC-003: Archived Change metadata must be archived and its `archivePath`, when
  present, must match the actual relative path.
- AC-004: `getChangeStatusForChange()` fail-closes forged or misplaced active
  metadata and does not expose it as selected-demand truth.
- AC-005: Legacy `getChangeStatus()` keeps single-active compatibility but
  reports metadata mismatch as a blocking close-gate issue.
- AC-006: `closeChangeForChange()` and `abandonChangeForChange()` reject
  requested Change ids whose metadata id does not match.
- AC-007: Workbench topic summary/detail does not expose forged active metadata
  id/title.
- AC-008: Thread-log canonical Change id import cannot be redirected by forged
  active metadata.
- AC-009: Valid archived topic lookup by archived metadata id still works.
- AC-010: `src/change/manager.ts` becomes a compatibility facade.
- AC-011: Change schemas/types, paths, metadata, templates, repository,
  creation, status, close-gate, lifecycle, and guards have clear module
  boundaries.
- AC-012: Existing public imports and normal Change create/status/close/abandon
  behavior remain compatible.
- AC-013: New `src/change/*` modules do not depend on the manager facade,
  Workbench, server routes, web UI, or CLI command modules.
- AC-014: No runtime/action/route/CLI command/scheduler/parallel/multi-Change
  auto creation/ODWF JS runtime/cache replay behavior is introduced.
- AC-015: Product and Harness verification pass, or pre-existing failures are
  clearly recorded.

## Non-Goals

- No `run/manager.ts` split in this phase.
- No change to Change artifact paths or JSON shape.
- No change to Workbench action payloads, decision/audit scope, SSE shape,
  thread storage shape, or CLI output.
- No change to existing index refresh or AC map refresh behavior.
