# Spec: Maintenance Canonical Patch Target Boundary Reuse

## Goal

Consolidate maintenance canonical patch target-boundary logic into a shared `src/agent-task` owner module so descriptor generation and application validation reuse the same path, root-safety, hash, target-kind, and descriptor checks.

## Users

- Future AHO development agents extending the maintenance / canonical patch chain.
- AHO users relying on human-gated canonical docs/stable-memory patch application remaining fail-closed.
- Reviewers checking that Architecture Growth Control is reducing repeated local mechanisms rather than adding another phase.

## Acceptance Criteria

- AC-001: Canonical patch target descriptor generation still builds descriptors only from explicit safe patch evidence and returns `null` for unsafe or incompatible hints.
- AC-002: Canonical patch application still fails closed for stale hashes, ambiguous hunks, unsafe paths, target-kind boundary violations, missing human gate, and missing ToolPolicyGate evidence.
- AC-003: A new focused owner module under `src/agent-task` owns shared canonical patch target-boundary helpers; `canonical-patch-targets.ts` and `canonical-patch-application.ts` reuse it instead of maintaining separate local implementations.
- AC-004: Artifact JSON shapes, ledger event types, public manager facade exports, Workbench/server/frontend behavior, human gates, workflow truth, and automatic rewrite boundaries remain unchanged.

## Non-Goals

- New canonical patch application behavior.
- New maintenance report, manifest, descriptor, or evidence phase.
- Broad maintenance, Workbench, scheduler, Goal Loop, or frontend refactor.
- Changing reference projects.

## Constraints

- Keep Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, ToolPolicyGate, and Harness evolution as workflow truth.
- Keep maintenance canonical docs/stable-memory writes human-gated and ToolPolicy-audited.
- Reuse existing `src/agent-task` ownership; do not move main logic into Workbench/server/frontend/manager facade.
- Preserve current artifact schemas and markdown evidence semantics.
- Reference projects are design evidence only.

## Risks

- A shared helper could accidentally change error semantics or null-vs-throw behavior. Mitigation: keep descriptor generation's null behavior distinct from application validation's throwing behavior and run existing boundary tests.
- Target-kind path boundaries could become stricter for descriptor generation. Mitigation: this is acceptable only if unsafe hints remain blocked and existing safe descriptors still pass; no artifact shape change.
- The slice could expand into broader maintenance refactor. Mitigation: limit changes to target boundary helpers and direct callers.

