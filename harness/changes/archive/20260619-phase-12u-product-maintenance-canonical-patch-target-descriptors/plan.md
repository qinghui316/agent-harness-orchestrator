# Plan: Phase 12U Product Maintenance Canonical Patch Target Descriptors

## Approach

Thread optional target hints through the existing maintenance evidence chain, then
centralize descriptor creation in a small read-only owner module. The owner module
will be the only place that validates target paths, reads current file bytes, and
computes SHA-256 expected hashes. Existing candidates without patch payloads will
continue to produce patch proposals whose application manifests are blocked.

## Steps

1. Extend maintenance types and schemas with optional target hints and patch
   drafts.
2. Preserve optional docs-drift patch drafts from closeout input through
   candidate creation, resolution, and canonical update proposal summaries.
3. Add `src/agent-task/canonical-patch-targets.ts` to build descriptors from
   explicit safe hints only.
4. Attach descriptors during canonical patch proposal construction only when the
   descriptor builder returns a valid descriptor for the operation target kind.
5. Keep proposal/application markdown explicit that readiness is non-executing
   evidence.
6. Add targeted unit coverage for ready, blocked, unsafe, compatibility,
   SHA-256, Workbench honesty, and no-mutation behavior.
7. Run Harness and product verification, then perform a close-ready review before
   archive/commit.

## Decisions

- `expectedContentHash` uses Node `crypto` SHA-256 over file bytes, not the local
  short `contentHash()` helper used for IDs.
- Replacement payloads must have non-empty replacement text. Hunk payloads must
  contain at least one hunk and every hunk must have non-empty `oldText` and
  `newText`; insert-only semantics remain a future explicit design.
- Target descriptors store normalized slash-separated relative paths only.
- Unsafe hints are not serialized as partial descriptors; they simply leave
  operations descriptor-less and manifests blocked.
- Ready manifests remain evidence only and keep authority booleans false.

## Module Boundary Plan

- Owner module: `src/agent-task/canonical-patch-targets.ts`.
- New / moved responsibilities: target hint selection, safe path resolution,
  symlink/root validation, current file byte hashing, and descriptor payload
  validation.
- Facade touch points: `src/agent-task/canonical-updates.ts` calls the owner
  module when building patch proposal operations; candidate/resolution modules
  only carry optional evidence fields.
- Forbidden write-back locations: Workbench projections, bridge code, canonical
  docs, stable memory, source worktrees, Harness files, and application gate code
  must not perform writes.
- Compatibility surface: old maintenance artifacts without target hints or patch
  drafts must parse and remain blocked where descriptors are absent.
- Boundary tests: agent-task lifecycle tests for descriptor creation and
  blocked/unsafe behavior, plus Workbench/read-model honesty and no-mutation
  checks.
- Follow-up split candidates: none.

## Planning-Discovered Gaps

- Phase 12R patch proposals currently summarize intended operations but lack
  concrete targets. Phase 12U resolves only the carrier/descriptor gap; a future
  phase must still design a human-gated deterministic writer before any rewrite
  can occur.
- Existing docs-budget/stable-memory candidates do not carry patch payloads. They
  should remain descriptor-less until a later phase supplies concrete payload
  evidence.
