# Spec: maintenance-canonical-ledger-event-policy-reuse

## Goal

Strengthen the maintenance ledger event-policy boundary by making canonical maintenance evidence event classification reusable instead of feature-local inside candidate extraction.

## Users

- Future AHO agents adding maintenance ledger events.
- Maintainers reviewing whether canonical maintenance evidence can accidentally feed back into candidate extraction.

## Acceptance Criteria

- AC-001: Canonical maintenance evidence events are classified by a shared ledger event-policy helper, not a private `candidates.ts` event list.
- AC-002: Maintenance candidate extraction continues to skip canonical update proposal, update decision, patch proposal, patch application gate, patch application manifest, patch application result, and patch application report ledger events.
- AC-003: Candidate subtype mapping remains candidate-domain logic in `candidates.ts`.
- AC-004: Ledger IO, ledger idempotency, event type schemas, canonical artifact generation, Workbench behavior, and human-gated canonical application behavior remain unchanged.
- AC-005: Product and Harness verification pass for the changed slice.

## Non-Goals

- Do not add or rename ledger event types.
- Do not change `MaintenanceLedgerEventType` or `ledgerSchema` except if a compile-only export is necessary, which this plan does not expect.
- Do not move candidate subtype mapping or candidate creation/scoring/review logic into the ledger policy helper.
- Do not change Workbench, Scheduler, Goal Loop, runtime bridge, ToolPolicyGate, apply/close, remote, or Harness evolution behavior.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- The helper may only classify canonical maintenance evidence event types as derived evidence.
- The helper must not be named or implemented as a candidate-pipeline action such as `shouldExcludeFromCandidates`.
- Any event collection must not be exported as a mutable `Set`.
- `README.md` remains unrelated and untracked.

## Risks

- Naming the helper around candidate filtering would move candidate-domain policy into ledger code.
- Exporting a mutable event set could let other modules mutate core event policy at runtime.
- Expanding this slice into event schemas, Workbench projections, or canonical artifact behavior would violate the current narrow Architecture Growth Control direction.
