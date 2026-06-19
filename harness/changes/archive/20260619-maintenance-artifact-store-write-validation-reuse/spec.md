# Spec: maintenance-artifact-store-write-validation-reuse

## Goal

Move maintenance artifact write-time schema validation into the shared `MaintenanceArtifactStore` persistence owner so canonical maintenance artifact writers do not repeat local validation immediately before shared JSON/Markdown writes.

## Users

- Future AHO developers adding maintenance artifact families.
- Current maintenance/canonical patch chain users who rely on schema-validated JSON/Markdown artifacts.

## Acceptance Criteria

- AC-001: `writeMaintenanceJsonMarkdownArtifact()` validates the supplied artifact with the store schema before any JSON or Markdown write.
- AC-002: The canonical update / patch proposal / application / report writers no longer repeat immediate pre-write `schema.parse(...)` calls that are now owned by the store writer.
- AC-003: Artifact ids, JSON object content, Markdown rendering, ledger event behavior, lineage checks, target-boundary checks, authority flags, and human-gated behavior remain unchanged.
- AC-004: Invalid artifact input is rejected by the shared writer and does not leave partial JSON or Markdown files.
- AC-005: The change records Module Boundary and Core Mechanism Reuse coverage and closes with aligned handoff docs.

## Non-Goals

- Do not change any artifact schema or artifact file path.
- Do not write the parsed clone returned by Zod; use parsing as validation only to preserve current persisted object behavior.
- Do not change candidate scoring/review/resolution writers, closeouts, ledgers, doc budget reports, or maintenance review files that do not use `MaintenanceArtifactStore`.
- Do not add Workbench, scheduler, Goal Loop, runtime bridge, source apply, remote handoff, or Harness evolution behavior.

## Constraints

- The shared writer must validate before either JSON or Markdown is written.
- Markdown renderers remain caller-owned and pure; the only timing change is that the Markdown string argument may be constructed before shared validation, but persistence cannot happen before validation.
- Scope is limited to the seven immediate pre-write parses in the canonical maintenance writers.
- `README.md` remains unrelated and untracked.

## Risks

- If the writer persisted the parsed clone instead of the original object, unknown-key or transform behavior could change artifact bytes. The implementation must avoid that.
- A broad cleanup could accidentally remove lineage, target-boundary, authority, ToolPolicyGate, or human-gate checks. The implementation must not touch those checks.
- A failed validation could accidentally leave partial files if validation happens after one write. The test must guard against that.

