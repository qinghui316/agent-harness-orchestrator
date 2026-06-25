# Plan: workbench-codex-backed-integrationfix-real-repair-v1

## Approach

Keep `src/integration-check` as the owner. Extend `runIntegrationFixAttempt` so the default repair runner starts Codex in the integration fix checkout, records run artifacts, collects a repaired patch, and lets existing aggregate validation/audit decide whether the repaired artifact can become the latest apply candidate.

## Steps

1. Add IntegrationFix attempt metadata for repair mode and Codex run artifact refs.
2. Implement the default Codex-backed repair runner inside the IntegrationCheck owner.
3. Keep deterministic marker repair as an explicit injected test runner.
4. Wire `runIntegrationCheck` to pass the same-Change id and optional test runner to fix attempts.
5. Add targeted tests for success, failure, source safety, and aggregate revalidation.
6. Update review and closeout evidence.

## Decisions

- Default product behavior is Codex-backed repair.
- Marker removal is retained only as a deterministic test helper.
- `runIntegrationCheck` accepts an optional repair runner for tests; Workbench/scheduler production paths do not pass it.
- IntegrationFix remains proposal-only until the existing manual integration apply gate is confirmed.

## Minimality Gate Plan

- Can this be a no-op: no; current owner had marker-only repair and could fake real IntegrationFix success.
- Reuse: `runIntegrationFixAttempt`, Codex workspace-write args/parser/completion, run artifacts, dependency bridge, aggregate validation/audit, IntegrationCheck apply/discard guards.
- Shared root fix: fixed the IntegrationFix owner instead of adding Workbench-specific guards or scheduler-specific repair branches.
- Avoided: new workflow runtime, permission system, projection framework, evidence family, full executor, feature-local apply logic.
- Smallest coherent change: one optional runner injection for tests plus default Codex repair in the existing owner.

## Module Boundary Plan

- Owner module: `src/integration-check`.
- New / moved responsibilities: default repair leaf execution now runs Codex inside `runIntegrationFixAttempt`.
- Facade touch points: `src/integration-check/manager.ts` exports the new testable type surface.
- Forbidden write-back locations: source root, Workbench projection state, Harness docs, remote providers.
- Compatibility surface: existing `runIntegrationCheck(project, worktreeIds, changeId)` callers are unchanged; optional fourth argument is test/support only.
- Boundary tests: targeted IntegrationFix, IntegrationCheck apply/discard, and slow apply/integration marker fixture.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Codex workspace-write invocation, dependency bridge, run artifact session, aggregate validation/audit, integration artifact hashing, source status checks.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: IntegrationFix prompt and repaired patch collection stay in `src/integration-check/fix-attempts.ts`.
- Shared cross-cutting logic location: Codex capability/argv/parser/process helpers remain in their existing modules.
- Local framework / state machine / projection / validation / gate avoided: yes.
- Future-cost reduction for similar features: IntegrationFix failures now have a real repair leaf while preserving existing gates and evidence format.

## Planning-Discovered Gaps

- The old slow IntegrationFix marker test waited on unrelated audit acceptance helpers; the test now directly exercises IntegrationCheck and manual integration apply.
