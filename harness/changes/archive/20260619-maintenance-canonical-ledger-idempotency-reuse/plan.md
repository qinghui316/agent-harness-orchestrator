# Plan: Maintenance Canonical Ledger Idempotency Reuse

## Approach

Add one narrow helper to `src/agent-task/ledger.ts`, tentatively `ensureMaintenanceLedgerEntryForArtifactRef`. The helper will:

- read current ledger entries;
- return without writing if an entry with the same `eventType` already includes the primary `artifactRef`;
- otherwise call `recordMaintenanceLedgerEntry`;
- build written `artifactRefs` as `[primaryArtifactRef, ...callerArtifactRefsWithoutDuplicatePrimary]`.

Then replace local duplicated `ensure...LedgerEntry` implementations in canonical update, canonical patch application, and canonical patch application report modules with small call sites that still construct the domain-specific event type, summary, primary ref, and Markdown ref.

## Steps

1. Add the helper in `src/agent-task/ledger.ts` without changing raw append behavior.
2. Update `src/agent-task/canonical-updates.ts` to use the helper for proposal/decision/patch/gate ledger entries.
3. Update `src/agent-task/canonical-patch-application.ts` to use the helper for manifest/result ledger entries.
4. Update `src/agent-task/canonical-patch-application-report.ts` to use the helper for report ledger entries.
5. Run targeted and project verification, then complete independent close-ready review and handoff.

## Decisions

- Plan self-evaluation: subagent PASS. Corrections applied: keep helper narrow, do not change raw append, guarantee primary ref inclusion, preserve exact idempotency key, keep feature-specific event/summary/ref ownership in feature modules, and mark Module Boundary/Core Mechanism Reuse applicable in review.
- Reference evidence: AgentScope Java's append-only ledger plus curated memory split and Symphony's durable evidence/reconcile pattern support a shared ledger owner, but no reference runtime code is copied.

## Module Boundary Plan

- Owner module: `src/agent-task/ledger.ts`.
- New / moved responsibilities: idempotent maintenance ledger entry recording by event type and primary artifact ref.
- Facade touch points: none expected; manager exports for raw ledger append/list remain unchanged unless tests reveal a need for explicit helper export.
- Forbidden write-back locations: Workbench, bridge, frontend, server, manager facade main logic, candidate filtering, maintenance review policy, human-gate, ToolPolicyGate, target-boundary, lineage, patch application, and reference source.
- Compatibility surface: ledger schema, event types, summaries, artifact refs, artifact JSON/Markdown, public behavior, repeated-call idempotency, and append-only raw writer.
- Boundary tests: existing `agent-task-boundaries` ledger count/idempotency coverage plus targeted verification.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: the maintenance ledger remains the append-only evidence stream; this change strengthens its owner with repeated idempotency logic.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; duplicated callers currently implement the same ledger-entry existence check locally.
- Domain-specific logic location: canonical update/patch/application/report modules still own artifact construction, rendering, summaries, refs, and authority language.
- Shared cross-cutting logic location: `src/agent-task/ledger.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids more local ledger idempotency helpers and does not introduce new evidence/report/manifest/descriptor phases.
- Future-cost reduction for similar features: future maintenance event producers can reuse the helper instead of copying event/ref existence checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

