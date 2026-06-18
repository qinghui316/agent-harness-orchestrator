# Spec: Maintenance Canonical Ledger Idempotency Reuse

## Goal

Reduce repeated maintenance canonical ledger idempotency logic by moving the shared "ensure a ledger entry exists for this event type and primary artifact ref" behavior into the existing ledger owner.

## Users

- Future AHO implementers extending maintenance canonical update/patch/application/report flows.
- Reviewers checking that new maintenance evidence paths reuse shared ledger mechanics instead of copying local idempotency guards.

## Acceptance Criteria

- AC-001: Canonical update proposal/decision, canonical patch proposal/gate, application manifest/result, and observation report generation preserve existing ledger event types, summaries, artifact refs, and repeated-call idempotency.
- AC-002: `src/agent-task/ledger.ts` owns a narrow helper for idempotent ledger recording by exactly `eventType + primaryArtifactRef`, while `recordMaintenanceLedgerEntry` remains raw append-only.
- AC-003: Feature modules still own event type, summary text, artifact ref construction, artifact building/rendering, and workflow authority; no schema, public API, Workbench, candidate filtering, human-gate, ToolPolicyGate, target-boundary, lineage, or patch application behavior changes.
- AC-004: The change demonstrates Core Mechanism Reuse / Architecture Growth Control by removing duplicated local ledger idempotency guards without adding a new feature-local framework, state machine, projection, validation gate, or evidence phase.

## Non-Goals

- Do not change the ledger schema, event type enum, candidate filtering, maintenance review logic, Workbench/server/frontend behavior, manager facade exports, or public CLI/API behavior.
- Do not change canonical update/patch artifact JSON or Markdown shapes.
- Do not change canonical target-boundary, lineage/alignment, ToolPolicyGate, human gate, or patch application responsibilities.
- Do not introduce automatic canonical rewrites or any new maintenance evidence family.

## Constraints

- Helper idempotency must remain exactly `same eventType && artifactRefs.includes(primaryArtifactRef)`.
- The helper must guarantee the primary artifact ref is included in the written `artifactRefs`, preferably as the first ref, while preserving caller-provided secondary refs.
- `recordMaintenanceLedgerEntry` must remain available for raw append callers.
- References are design evidence only; do not copy reference runtime code.

## Risks

- Over-generalizing the helper into a ledger policy engine would blur ownership and create a new cross-cutting abstraction beyond the slice.
- Accidentally deduping by summary, secondary refs, or event family could change append-only semantics.
- Dropping Markdown refs or reordering feature-owned refs incorrectly could alter artifact evidence expectations.

