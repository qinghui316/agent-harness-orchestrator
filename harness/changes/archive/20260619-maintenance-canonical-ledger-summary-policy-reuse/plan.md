# Plan: maintenance-canonical-ledger-summary-policy-reuse

## Approach

Add a small explicit policy helper to the existing ledger event-policy owner, then route only canonical store-backed ledger ensure calls through a policy-aware store helper. The canonical modules will continue to own artifact construction and domain summaries; the shared ledger/event-policy layer will own the repeated safety suffixes.

## Steps

1. Extend `src/agent-task/ledger-event-policy.ts` with `buildMaintenanceLedgerEventSummary()` or equivalent explicit event-type map.
2. Add a policy-aware store-backed helper in `src/agent-task/ledger.ts` that preserves `ensureMaintenanceLedgerEntryForStoreArtifact()` idempotency and artifact refs while applying the policy to raw artifact summaries.
3. Replace only the seven canonical store-backed ledger ensure call sites in `src/agent-task/canonical-updates.ts`, `src/agent-task/canonical-patch-application.ts`, and `src/agent-task/canonical-patch-application-report.ts`.
4. Extend `tests/unit/agent-task-boundaries.test.ts` for policy helper output, fallback behavior, candidate-source classification, and generated result/report ledger summaries.
5. Run targeted and full product/Harness verification, then complete independent close-ready review and handoff.

## Decisions

- Use an explicit event-type map/switch rather than a template engine or DSL.
- Do not alter `recordMaintenanceLedgerEntry()` so manually recorded ledger summaries remain raw.
- Keep existing canonical ledger suffix wording equivalent.
- Current docs/code are sufficient evidence; no reference-project source is needed for this local owner-boundary reuse slice.

## Module Boundary Plan

- Owner module: `src/agent-task/ledger-event-policy.ts` owns event-type policy/classification and canonical evidence ledger summary suffix policy; `src/agent-task/ledger.ts` owns ledger entry construction and idempotent store-backed ensure behavior.
- New / moved responsibilities: repeated canonical ledger summary suffix policy moves from canonical feature modules into ledger/event-policy owners.
- Facade touch points: no manager facade behavior change; existing exports remain compatible.
- Forbidden write-back locations: do not add new main logic to `src/agent-task/manager.ts`, Workbench, bridge, frontend, scheduler, Goal Loop, or broad compatibility facades.
- Compatibility surface: existing artifact JSON/Markdown, ledger event types, artifact refs, idempotency, candidate source policy, public manager exports, and generated maintenance summaries remain compatible.
- Boundary tests: agent-task boundary tests for shared ledger policy output and generated ledger summaries.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable; this change directly touches module-boundary ownership.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `ledger-event-policy` event classification, `ledger` store-backed ensure idempotency, and `MaintenanceArtifactStore` artifact refs.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; this strengthens existing owners with the missing summary-policy responsibility.
- Domain-specific logic location: canonical modules keep artifact summaries and event type selection.
- Shared cross-cutting logic location: canonical evidence ledger safety suffixes live in `ledger-event-policy`; final ledger entry construction lives in `ledger`.
- Local framework / state machine / projection / validation / gate avoided: avoids feature-local ledger summary policy and avoids a new ledger DSL/template framework.
- Future-cost reduction for similar features: adding a future canonical maintenance event requires one policy entry and one store-backed ledger ensure path rather than repeated local suffix strings.
- If not applicable, reason: not applicable; Core Mechanism Reuse is the point of this slice.

## Planning-Discovered Gaps

- Subagent plan review passed with required constraints: only handle seven canonical store-backed ledger entries, keep `recordMaintenanceLedgerEntry()` raw, preserve idempotency by eventType + artifactRef, avoid double suffix, and test proposal/manifest/result/report policy classes plus fallback.

