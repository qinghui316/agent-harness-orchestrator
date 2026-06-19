# Spec: maintenance-canonical-patch-application-authority-helper-reuse

## Goal

Consolidate repeated canonical patch application non-executing authority flags into a focused shared owner so application gate, manifest, and observation report builders cannot drift independently.

## Users

- Future AHO implementers extending the maintenance / canonical patch chain.
- Reviewers auditing canonical patch authority boundaries and human-gated application evidence.
- Operators relying on stable canonical patch application evidence.

## Acceptance Criteria

- AC-001: `src/agent-task/canonical-patch-application-authority.ts` owns a focused helper for the four false non-executing application authority flags: `sourceMutationAuthorized`, `canonicalUpdateApplied`, `canonicalPatchApplied`, and `executionStarted`.
- AC-002: Canonical patch application gate record construction reuses the helper instead of repeating those flags locally.
- AC-003: Canonical patch application manifest construction reuses the helper instead of repeating those flags locally.
- AC-004: Canonical patch observation report construction reuses the helper for the four false fields while preserving `applicationAuthorized: true`.
- AC-005: Targeted tests prove the helper output and existing gate, manifest, and report artifacts still expose the same authority values.
- AC-006: The change does not alter artifact shapes, generated ids, markdown authority text, schemas, ledger event semantics, ToolPolicyGate/human gate behavior, Workbench behavior, scheduler behavior, or Goal Loop behavior.

## Non-Goals

- No new product feature phase.
- No broad authority framework or permission model.
- No change to canonical update decision authority, patch proposal authority, applied result authority, `applicationAuthorized`, schema definitions, markdown wording, ledger policy, target taxonomy, or canonical mutation behavior.
- No automatic stable memory, canonical docs, ECL, Harness template, source-root, apply/close, remote, IntegrationCheck, Validation, Audit, scheduler, Goal Loop, or Harness evolution transition.
- No reference-project source edits.

## Constraints

- Keep the change inside the `src/agent-task/*` maintenance owner boundary.
- Preserve all public API, generated artifact shape, authority flag values, and existing Workbench-visible behavior.
- Follow Architecture Growth Control / Core Mechanism Reuse: strengthen a focused shared owner rather than preserving repeated local authority literals.

## Risks

- Authority flags are safety evidence; accidentally including `applicationAuthorized` or changing an applied-result flag would be a behavioral regression.
- A too-broad helper could become an unreviewed authority framework rather than a narrow reuse owner.
- Importing from an application builder module into canonical update code could create dependency tangles.
