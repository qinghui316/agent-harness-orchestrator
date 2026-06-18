# Plan: maintenance-canonical-artifact-reference-reuse

## Approach

Add the smallest shared reference helper in the maintenance artifact owner area, then replace repeated canonical artifact ref assembly in the maintenance canonical chain.

The helper will not own business rules. It can produce `artifactRef`, `markdownRef`, and `ledgerArtifactRefs` from existing path functions. The feature modules keep event types, summaries, authority/gate flags, lineage validation, schema validation, rendering, candidate filtering, and canonical application behavior.

## Steps

1. Add a focused helper in `src/agent-task/maintenance-artifact-store.ts` or a nearby small module owned by the maintenance artifact layer.
2. Refactor `src/agent-task/canonical-updates.ts`, `src/agent-task/canonical-patch-application.ts`, and `src/agent-task/canonical-patch-application-report.ts` to use the helper while preserving exported `maintenanceCanonical*ArtifactRef` functions.
3. Update tests in `tests/unit/agent-task-boundaries.test.ts` to assert the canonical report ledger still uses the JSON ref first, includes the Markdown ref, and does not feed candidate extraction.
4. Run targeted and standard product/Harness verification.
5. Complete independent close-ready review before close.

## Decisions

- Use a small helper instead of a new framework: this is a shared artifact reference shape, not a new artifact protocol or ledger policy.
- Keep all public manager exports and artifact-ref function names stable.
- Keep candidate filtering in `candidates.ts`, ledger idempotency in `ledger.ts`, lineage in `canonical-patch-lineage.ts`, and artifact IO in `maintenance-artifact-store.ts`.
- Do not inspect or copy reference project source; `docs/design-docs/ref-agentscope-java.md` is sufficient design evidence for maintenance ledger/consolidator boundaries in this narrow slice.

## Module Boundary Plan

- Owner module: maintenance artifact layer under `src/agent-task/`, preferably near `maintenance-artifact-store.ts`.
- New / moved responsibilities: canonical maintenance artifact reference shape only.
- Facade touch points: `src/agent-task/manager.ts` should remain a stable export surface only; no new main logic belongs there.
- Forbidden write-back locations: Workbench, bridge, frontend, manager facade, scheduler, Goal Loop, candidate filtering, ledger policy, and lineage modules for unrelated responsibilities.
- Compatibility surface: exported `maintenanceCanonical*ArtifactRef` functions and manager exports remain available.
- Boundary tests: existing agent-task boundary unit tests cover behavior through the public maintenance functions.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: maintenance artifact store/ref owner, ledger idempotency, canonical patch lineage owner, target-boundary owner, candidate event filtering, and existing tests.
- Why existing mechanisms are insufficient if a new mechanism is proposed: existing artifact IO is shared, but canonical JSON/Markdown/ledger ref shape is still repeated locally; the new helper fills only that gap.
- Domain-specific logic location: `canonical-updates.ts`, `canonical-patch-application.ts`, and `canonical-patch-application-report.ts` retain domain builders, event choices, summaries, authority flags, rendering, and application behavior.
- Shared cross-cutting logic location: maintenance artifact reference helper.
- Local framework / state machine / projection / validation / gate avoided: avoids a feature-local artifact reference protocol in every canonical maintenance stage; does not create a new state machine, projection system, safety gate, or ledger policy.
- Future-cost reduction for similar features: later canonical maintenance stages can reuse the same ref shape without reimplementing JSON/Markdown/ledger reference ordering.

## Planning-Discovered Gaps

- Plan self-evaluation by subagent `019edc70-f8fb-7b81-9a6f-8714759041f4` returned PASS.
- Required adjustment from review: verification must include at least target vitest, `npm run typecheck`, `npm run lint`, `npm run test:fast`, and `npm run build`; skipped broader integration/workbench gates must be justified in review.
- Required adjustment from review: helper must not encapsulate eventType, summary, candidate filtering, human gate, lineage, ledger idempotency, or authority behavior.
