# Spec: maintenance-canonical-patch-target-kinds-helper-reuse

## Goal

Consolidate canonical patch target-kind aggregation onto a shared lineage helper so proposal and manifest builders do not each repeat local sorted/deduped `targetKinds` merge logic and casts.

## Users

- Future AHO implementers extending the maintenance / canonical patch chain.
- Reviewers auditing target-kind lineage and artifact compatibility.
- Operators relying on stable canonical patch proposal and manifest evidence.

## Acceptance Criteria

- AC-001: `src/agent-task/canonical-patch-lineage.ts` owns a pure typed helper that accepts `MaintenanceCanonicalUpdateTargetKind[]` groups and returns sorted/deduped `MaintenanceCanonicalUpdateTargetKind[]`.
- AC-002: Canonical patch proposal construction reuses the helper instead of locally merging `proposal.targetKinds` and operation target kinds.
- AC-003: Canonical patch application manifest construction reuses the helper instead of locally merging gate and patch proposal target kinds.
- AC-004: Targeted tests prove mixed duplicate and out-of-order target-kind inputs still produce stable sorted/deduped target kinds for proposal and manifest outputs.
- AC-005: The change does not alter artifact shapes, generated ids, markdown authority text, schemas, ledger event semantics, ToolPolicyGate/human gate behavior, Workbench behavior, scheduler behavior, or Goal Loop behavior.

## Non-Goals

- No new product feature phase.
- No new artifact family, report, manifest, descriptor, gate, projection, target-kind taxonomy, or canonical mutation behavior.
- No automatic stable memory, canonical docs, ECL, Harness template, source-root, apply/close, remote, IntegrationCheck, Validation, Audit, scheduler, Goal Loop, or Harness evolution transition.
- No reference-project source edits.

## Constraints

- Keep the change inside the `src/agent-task/*` maintenance owner boundary.
- Preserve all public API, generated artifact shape, target-kind ordering semantics, and existing Workbench-visible behavior.
- Follow Architecture Growth Control / Core Mechanism Reuse: strengthen an existing shared lineage owner rather than adding or preserving repeated local merge logic.

## Risks

- Target-kind arrays are artifact evidence; changing ordering or dedupe semantics would be a compatibility regression.
- A too-broad cleanup could mix this narrow reuse slice with authority flags, markdown rendering, schemas, or target taxonomy changes.
- Importing from the wrong layer could turn a pure maintenance helper reuse into a boundary violation.
