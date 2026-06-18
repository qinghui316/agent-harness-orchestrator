# Spec: Maintenance Canonical Patch Lineage Reuse

## Goal

Reduce repeated canonical patch lineage and operation-alignment validation by moving shared guards into one owner module under `src/agent-task`, while preserving current maintenance behavior and authority boundaries.

## Users

- Future AHO maintainers extending maintenance canonical patch artifacts.
- Main agents continuing Architecture Growth Control work.
- Users relying on maintenance self-evolution guardrails to stay human-gated and fail closed.

## Acceptance Criteria

- AC-001: Canonical patch application manifest generation and application still fail closed for stale or mismatched gate/proposal/manifest lineage and operation counts.
- AC-002: Canonical patch application observation report generation still fails closed for stale or mismatched result/manifest lineage and operation alignment.
- AC-003: Shared lineage/alignment responsibilities live in a focused `src/agent-task` owner module reused by application and report code.
- AC-004: Artifact schemas, JSON/Markdown output shapes, ledger event types, public manager exports, Workbench/server/frontend behavior, human gates, ToolPolicyGate requirements, target-boundary behavior, patch application behavior, and workflow truth remain unchanged.

## Non-Goals

- No new product evidence phase or artifact family.
- No schema, public API, or manager facade export changes.
- No target path/hash/descriptor refactor beyond the existing `canonical-patch-target-boundary.ts` owner.
- No changes to canonical docs/stable-memory write authorization, automatic rewrite behavior, scheduler, or Goal Loop.

## Constraints

- Follow Architecture Growth Control / Core Mechanism Reuse: strengthen a shared owner instead of adding another feature-local lineage helper.
- Preserve fail-closed error messages closely enough that existing tests and operator diagnostics remain stable.
- Keep domain-specific artifact building, rendering, writing, ledger recording, human-gate authorization, and patch content application in their existing modules.
- Do not touch unrelated `README.md`.

## Risks

- Over-extracting could create a generic lineage framework that is broader than this maintenance slice.
- Changing error strings could weaken existing stale-lineage diagnostics.
- Accidentally moving authorization or patch application into the lineage helper would blur owner boundaries.

