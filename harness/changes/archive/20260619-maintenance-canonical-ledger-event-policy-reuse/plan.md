# Plan: maintenance-canonical-ledger-event-policy-reuse

## Approach

Introduce the smallest reusable ledger event-policy owner and have candidate extraction consume it.

The policy helper will only answer whether a `MaintenanceLedgerEventType` is a canonical maintenance evidence event. Candidate-specific subtype mapping, candidate extraction, scoring, reviews, lifecycle resolution, and proposal generation stay in `candidates.ts` and related maintenance modules.

## Steps

1. Add `src/agent-task/ledger-event-policy.ts` with a readonly canonical evidence event list and `isMaintenanceCanonicalEvidenceEvent(eventType)`.
2. Update `src/agent-task/candidates.ts` to import the helper and remove its private canonical event-list function.
3. Update `tests/unit/agent-task-boundaries.test.ts` so the unified canonical ledger filtering test includes `canonical-patch-application-report`.
4. Run targeted and standard verification.
5. Complete independent close-ready review before close.

## Decisions

- Use a new small module instead of `ledger.ts` so `ledger.ts` remains IO/idempotency focused.
- Name the helper `isMaintenanceCanonicalEvidenceEvent`, not `shouldExcludeFromCandidates`, so the ledger policy describes event classification while candidate filtering remains a consumer decision.
- Do not export a mutable `Set`.
- Keep candidate subtype mapping in `candidates.ts`.

## Module Boundary Plan

- Owner module: `src/agent-task/ledger-event-policy.ts`.
- New / moved responsibilities: canonical maintenance evidence event classification.
- Facade touch points: none; no manager facade export is required.
- Forbidden write-back locations: Workbench, bridge, frontend, manager facade, Scheduler, Goal Loop, ledger IO/idempotency, candidate subtype mapping, canonical artifact writers, and event schemas.
- Compatibility surface: candidate pipeline behavior remains the same; no public CLI/Workbench/API shape changes.
- Boundary tests: `tests/unit/agent-task-boundaries.test.ts` covers the pipeline behavior through existing public maintenance functions.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: maintenance ledger event policy, candidate extraction, canonical maintenance event filtering, and agent-task boundary tests.
- Why existing mechanisms are insufficient if a new mechanism is proposed: canonical evidence event classification existed only as a private `candidates.ts` helper, which repeats ledger policy inside a feature module.
- Domain-specific logic location: `candidates.ts` keeps subtype mapping and pipeline behavior; canonical update / patch modules keep event writing and authority behavior.
- Shared cross-cutting logic location: `ledger-event-policy.ts` owns event classification only.
- Local framework / state machine / projection / validation / gate avoided: avoids a feature-local event policy list in candidate extraction; does not create a new state machine, projection, validation gate, or artifact protocol.
- Future-cost reduction for similar features: future canonical maintenance events have one policy owner to update before they can accidentally feed candidate extraction.

## Planning-Discovered Gaps

- Plan self-evaluation by subagent `019edc86-fd6d-78d3-a343-17b2ac455e8f` returned PASS with tightening.
- Required adjustment from review: include `canonical-patch-application-report` in the unified filtering test.
- Required adjustment from review: helper naming/comment must express canonical maintenance evidence classification, not candidate exclusion.
- Required adjustment from review: do not export a mutable `Set`; use a readonly tuple/array and private `ReadonlySet` if needed.
