# Spec

## Goal

Validation/Audit evidence must be scoped, fail-closed on direct reads, projection-safe on list paths, and implemented through clear domain modules instead of manager monoliths.

## Acceptance Criteria

- AC-001: Docs record latest auto-evolve archived, Phase 8P active, and no stale active auto-evolve claim remains.
- AC-002: `validation.json` read paths validate directory id, `id`, `runId`, and requested `changeId`.
- AC-003: `audit.json` read paths validate directory id, `id`, `runId`, and requested `changeId`.
- AC-004: List/projection/close-gate/apply-gate paths skip invalid Validation/Audit evidence instead of crashing or trusting it.
- AC-005: Direct read/show/accept paths reject forged, misplaced, malformed, or cross-Change evidence.
- AC-006: `acceptAudit()` rejects forged audit evidence and audit evidence with missing or cross-Change validation references.
- AC-007: `startAuditRun()` selects latest validation through guarded Validation repository behavior.
- AC-008: `src/validation/manager.ts` is a compatibility facade and no longer owns main implementation details.
- AC-009: `src/audit/manager.ts` is a compatibility facade and no longer owns main implementation details.
- AC-010: Old imports from Validation/Audit managers and artifacts modules remain compatible.
- AC-011: New Validation/Audit modules do not import manager facades, Workbench, server, web UI, or CLI command modules.
- AC-012: Validation/Audit artifact paths, JSON shape, event names, CLI output, Workbench projections, action payload, decision/audit scope, SSE, and thread storage remain unchanged.
- AC-013: Product and Harness verification pass, or any pre-existing failure is recorded.

## Non-Goals

- No new runtime capability, CLI command, Workbench action, HTTP route, scheduler, parallel execution, automatic child Change creation, ODWF JavaScript runtime, or cache/replay.
- No broad Workbench refactor.
