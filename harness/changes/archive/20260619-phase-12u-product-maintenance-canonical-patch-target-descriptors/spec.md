# Spec: Phase 12U Product Maintenance Canonical Patch Target Descriptors

## Goal

Product-maintenance canonical patch proposals can carry safe, deterministic
target descriptors when maintenance evidence supplies both an explicit target and
a concrete patch payload, enabling Phase 12T application manifests to distinguish
future-writer-ready patches from blocked evidence without executing any write.

## Users

- Main Agent and reviewers evaluating whether canonical maintenance evidence is
  complete enough for a later deterministic writer phase.
- Workbench/read-model consumers who need readiness evidence without accidental
  apply authority.
- Future product-maintenance phases that will need hash-bound patch targets
  before any human-gated writer can be considered.

## Acceptance Criteria

- AC-001: Maintenance candidate and resolution artifacts may optionally carry
  target hints and patch drafts while old artifacts without those fields remain
  valid.
- AC-002: Docs-drift closeout input may optionally include a concrete patch
  draft; existing docs-drift candidates without a patch draft still produce
  blocked application manifests.
- AC-003: A canonical patch proposal operation receives a target descriptor only
  when the hint target kind matches the operation target kind, the target path is
  a safe normalized relative path under `ResolvedMemory.memoryRoot`, the resolved
  file exists as a file, symlinks do not escape the memory root, and a concrete
  replacement or hunk payload exists.
- AC-004: Target descriptors store normalized relative target paths, never
  absolute machine paths, and `expectedContentHash` is computed with real SHA-256
  over current file bytes.
- AC-005: Unsafe, missing, directory, symlink-escaping, mismatched-kind, or
  no-payload hints are omitted from patch operations and leave application
  manifests blocked rather than partially ready.
- AC-006: Ready application manifests keep all authority flags false and do not
  expose writer/apply behavior or mutate canonical docs, stable memory, source,
  or Harness files.
- AC-007: Tests cover ready descriptor generation, no-payload blocked behavior,
  unsafe path blocked behavior, old-artifact compatibility, SHA-256 value/shape,
  Workbench/read-model honesty, and no file content mutation.

## Non-Goals

- No canonical docs or stable-memory writer.
- No source, docs, stable-memory, Workbench, Apply, Close, remote landing, or
  Harness evolution action.
- No new scheduler/parallel executor behavior.
- No generic documentation compaction or historical ledger rewrite.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation,
  Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Reference projects are design evidence only and are not runtime sources.
- Target descriptor generation must be read-only and deterministic from existing
  evidence plus current file content.
- New fields must be optional for artifact compatibility.
- Path safety must use real path/root checks rather than string checks alone.

## Risks

- A `ready-for-application` manifest may be misread as authorization; tests and
  markdown must keep readiness clearly non-executing.
- If target descriptors include absolute paths, artifacts become machine-local
  and unsafe; descriptors must store relative paths only.
- If unsafe hints are partially preserved as descriptors, a future writer could
  inherit bad evidence; unsafe hints must be omitted and remain blocked.
