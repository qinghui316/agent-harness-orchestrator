# Spec: workbench-external-local-restore-v1

## Goal

Restore old external-local Workbench sandboxes from a source marker plus the
current `AHO_HOME` memory store so users can reopen prior conversations and
current gates without reinitializing Harness.

## Users

- A developer reopening an E-drive acceptance sandbox or ordinary project with
  external-local AHO memory.
- AHO agents that need Workbench to project durable Change/gate state after a
  server restart.

## Acceptance Criteria

- AC-001: `workbench serve <sourcePath>` with no registry entry but a valid
  external-local marker restores a session-scoped project id from the marker.
- AC-002: `/api/projects` and `/api/projects/:id/workbench/snapshot` can serve
  the restored direct project without writing `registry.json`.
- AC-003: If `AHO_HOME/projects/<projectId>` exists and Harness is ready, the
  Workbench snapshot lists existing topics and derives the current real gate.
- AC-004: If marker exists but the external memory root is missing, Workbench
  shows an explicit memory-missing / AHO_HOME mismatch diagnostic, not generic
  Harness-uninitialized copy.
- AC-005: Restore never creates, overwrites, migrates, applies, discards,
  closes, or mutates source/memory state without an explicit existing action.
- AC-006: Invalid marker, duplicate/cross-path marker id, and missing-memory
  cases fail closed with clear diagnostics.

## Non-Goals

- No automatic apply/discard/close/merge.
- No full-auto, scheduler loop, parallel executor, or new workflow runtime.
- No registry write for direct `serve <path>` restoration.
- No memory-home picker or migration tool.

## Constraints

- `AHO_HOME` is the only V1 source for resolving external-local memory.
- Change/ECL artifacts, validation/audit, IntegrationCheck, and human gates
  remain workflow truth.
- Registry and UI state are routing/projection only.
- C drive acceptance directories must not be used.

## Risks

- Direct restored projects could conflict with registry projects if marker ids
  are reused; this must fail closed.
- A missing or wrong `AHO_HOME` can look like missing history unless surfaced
  clearly.
- UI copy can accidentally encourage reinitialization over repair/attach; tests
  should cover the visible diagnostic.
