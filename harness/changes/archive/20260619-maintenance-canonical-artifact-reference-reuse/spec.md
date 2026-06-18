# Spec: maintenance-canonical-artifact-reference-reuse

## Goal

Strengthen the maintenance canonical patch chain by reusing one small owner for canonical artifact reference shapes instead of hand-assembling the same JSON/Markdown/ledger reference pattern in each feature module.

## Users

- Future AHO agents extending product maintenance / self-evolution code.
- Maintainers reviewing whether new maintenance artifact stages reuse existing core mechanisms rather than growing local protocols.

## Acceptance Criteria

- AC-001: Canonical maintenance artifact refs are generated through a shared helper for the update proposal, update decision, patch proposal, application gate, application manifest, application result, and application report stages.
- AC-002: Existing public artifact-ref functions and manager exports remain compatible.
- AC-003: Domain-specific logic stays in current owner modules: eventType, ledger summary, authority flags, human gate flags, lineage validation, schema validation, candidate filtering, rendering, and canonical write behavior are not moved into the helper.
- AC-004: Tests cover the shared ref shape enough to prove ledger entries keep the canonical JSON ref first, include the Markdown ref, and canonical patch application report ledger evidence still does not feed new maintenance candidates.
- AC-005: Product and Harness verification pass for the changed slice.

## Non-Goals

- Do not add a new evidence-only/report/descriptor product phase.
- Do not change scheduler, Goal Loop, Workbench projection/action, runtime bridge, ToolPolicyGate, IntegrationCheck, apply/close, remote, or Harness evolution behavior.
- Do not introduce new maintenance event types or artifact schemas.
- Do not change canonical docs/stable-memory application semantics.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- The helper may only express cross-cutting artifact reference shape, such as `artifactRef`, `markdownRef`, and `ledgerArtifactRefs`.
- Existing maintenance artifact store, ledger idempotency, lineage, and target-boundary owners must remain authoritative for their current responsibilities.
- Reference projects are evidence only; no reference runtime code may be copied.
- `README.md` remains unrelated and untracked.

## Risks

- Over-abstracting the helper could hide domain authority or gate decisions in a shared utility.
- A ref helper that changes artifact ordering could break ledger idempotency or existing tests.
- Expanding the slice into Workbench or scheduler refactors would violate the current Architecture Growth Control direction.
