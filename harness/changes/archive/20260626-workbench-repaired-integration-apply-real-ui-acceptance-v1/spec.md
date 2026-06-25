# Spec: workbench-repaired-integration-apply-real-ui-acceptance-v1

## Goal

Prove that a Codex-backed IntegrationFix repaired integration artifact can be
applied to the external source root only after a real Workbench UI human
confirmation.

## Users

- AHO operator using Workbench to complete a low-conflict multi-worktree demand.
- Future agent continuing from ECL/handoff evidence.

## Acceptance Criteria

- AC-001: Workbench restores or recreates a passed repaired IntegrationCheck
  whose current primary gate is `integration-apply`.
- AC-002: The visible apply action carries the current IntegrationCheck id and
  latest repaired artifact hash.
- AC-003: Before apply, the external source root is clean and its source HEAD
  matches the IntegrationCheck source evidence.
- AC-004: After real browser confirmation of `apply-check.apply`, the external
  source root contains the repaired integration result and the IntegrationCheck
  status is `applied`.
- AC-005: Workbench no longer shows the stale integration apply/discard gate as
  the current primary gate after apply.
- AC-006: `完全访问权限` remains unavailable for integration apply/discard, and
  no remote, merge, PR, Harness evolution, or cross-Change action is executed.

## Non-Goals

- Do not automate integration apply/discard.
- Do not add a new workflow runtime, projection framework, scheduler executor,
  permission system, child Change model, or evidence family.
- Do not validate the discard branch unless the apply path exposes a related
  product blocker.

## Constraints

- Use E-drive acceptance directories only.
- Prefer the latest accepted sandbox; create a fresh E-drive sandbox only if
  the previous one is dirty, missing, or unrecoverable.
- Product fixes must stay in existing owners.

## Risks

- The previous sandbox may have been cleaned up or may no longer restore its
  gate; in that case a fresh real UI path is required.
- Applying the repaired artifact mutates only the external sandbox source root,
  never the AHO development checkout.
