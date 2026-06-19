# Plan: Maintenance Canonical Artifact Lifecycle Reuse

## Approach

Add a small owner module for maintenance artifact lifecycle operations, then replace duplicated canonical-chain write/ledger helper calls with that owner.

The helper should provide explicit APIs for:

- writing a freshly built maintenance artifact with markdown and ensuring the policy ledger entry;
- ensuring the policy ledger entry for an already existing artifact without rewriting JSON/Markdown.

Domain modules will still build ids, domain objects, markdown, authority flags, artifact refs, and validation. The shared helper only owns lifecycle plumbing.

## Steps

1. Add `src/agent-task/maintenance-artifact-lifecycle.ts` with typed helper functions for fresh write+ledger and existing ledger assurance.
2. Update `src/agent-task/canonical-updates.ts` to use the helper for canonical update proposal/decision, canonical patch proposal, and application gate paths; remove duplicated private ledger helper functions.
3. Update `src/agent-task/canonical-patch-application.ts` to use the helper for manifest/result paths; preserve existing artifact no-rewrite behavior.
4. Update `src/agent-task/canonical-patch-application-report.ts` to use the helper for report paths; preserve existing artifact no-rewrite behavior.
5. Run targeted boundary and maintenance verification, then update review/handoff and close.

## Decisions

- Keep stores in their current domain modules. This avoids widening public API surface or moving schema/path ownership in the same change.
- Keep markdown renderers in current modules. They are domain-specific and are not the duplicated mechanism being addressed.
- Do not update reference projects. No external reference evidence is needed for this internal mechanism reuse.

## Module Boundary Plan

- Owner module: `src/agent-task/maintenance-artifact-lifecycle.ts`.
- New / moved responsibilities: reusable maintenance artifact lifecycle plumbing for JSON/Markdown write plus policy ledger entry assurance.
- Facade touch points: none planned; `src/agent-task/manager.ts` public exports should remain unchanged.
- Forbidden write-back locations: Workbench action/server/frontend code, scheduler/Goal Loop/runtime modules, broad manager facades, schema/type authority, and human-gate code.
- Compatibility surface: existing exported maintenance canonical functions and generated artifact shapes remain compatible.
- Boundary tests: `tests/unit/agent-task-boundaries.test.ts`, `tests/unit/workbench-module-boundaries.test.ts`, and `tests/slow/workbench-maintenance-flow.test.ts`.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `writeMaintenanceJsonMarkdownArtifact`, `ensureMaintenancePolicyLedgerEntryForStoreArtifact`, typed `MaintenanceArtifactStore`, existing canonical lineage/authority/target-boundary helpers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: existing primitives are correct but every canonical artifact family repeats the same local write+ledger and existing-ledger pattern; the new helper composes existing primitives instead of replacing them.
- Domain-specific logic location: canonical update, patch proposal, application manifest/result, and report modules keep their domain object construction, markdown rendering, lineage, authority, and validation.
- Shared cross-cutting logic location: maintenance artifact lifecycle helper.
- Local framework / state machine / projection / validation / gate avoided: no new state machine, artifact protocol, projection system, safety gate, or Workbench action path.
- Future-cost reduction for similar features: future maintenance canonical artifacts can reuse one lifecycle helper instead of adding another local ensure/write pattern.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review `019ee1ec-76c0-7b92-b9f9-94bd39875def` returned PASS with two constraints: preserve existing-artifact no-rewrite idempotency, and include targeted `agent-task-boundaries`, `workbench-module-boundaries`, and maintenance slow-flow verification.
