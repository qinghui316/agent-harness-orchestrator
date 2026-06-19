# Spec: Maintenance Canonical Artifact Lifecycle Reuse

## Goal

Reduce repeated maintenance canonical artifact lifecycle plumbing by introducing one shared helper for policy-ledger-backed maintenance artifact writes and existing-artifact ledger assurance.

The change makes the existing canonical update / canonical patch chain more reusable without changing behavior.

## Users

- Future AHO agents adding maintenance canonical artifacts.
- Maintainers reviewing canonical maintenance chain behavior.
- Workbench users indirectly, because the same maintenance confirmations and projections should keep behaving identically.

## Acceptance Criteria

- AC-001: A shared maintenance artifact lifecycle helper owns the reusable "write JSON + Markdown artifact, ensure policy ledger entry, return artifact" flow.
- AC-002: Existing artifact paths preserve current idempotency: existing JSON/Markdown artifacts are not rewritten, and only the matching policy ledger entry is ensured before returning the existing artifact.
- AC-003: Canonical update proposal/decision, canonical patch proposal/application gate, application manifest/result, and application report creation paths reuse the shared helper instead of private duplicated ledger helper functions.
- AC-004: Product behavior remains compatible: no schema, artifact id, markdown body, authority flag, ToolPolicyGate, human gate, Workbench action, source mutation, scheduler, Goal Loop, or runtime behavior changes.
- AC-005: Targeted maintenance/boundary tests, typecheck, lint, Harness checks, and close-ready review pass.

## Non-Goals

- Do not introduce new maintenance artifacts, reports, descriptors, projections, gates, or ledger event types.
- Do not alter the deterministic patch writer, target validation, stale-target handling, or source mutation semantics.
- Do not touch scheduler, Goal Loop, Workbench action execution, frontend, bridge, or manager facade behavior except import compatibility if required.
- Do not run full `npm run test` unless verification reveals a broader risk.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Architecture Growth Control applies: cross-cutting lifecycle plumbing belongs in a shared owner; domain modules should keep only domain-specific artifact construction and validation.
- The helper must be small and explicit. It must not become a generic framework, state machine, projection layer, or gate authority.
- Existing artifact no-rewrite idempotency is mandatory.

## Risks

- Accidentally rewriting existing JSON/Markdown artifacts would change idempotency semantics.
- Over-generalizing the helper could create a new local framework instead of reducing duplication.
- Moving too much lifecycle logic at once could obscure authority and source-mutation boundaries.
