# Spec: workbench-post-apply-local-landing-autonomy-v1

## Goal

After the user manually confirms a plan with `完全访问权限`, the existing scoped
automation should be able to complete the local post-apply landing readiness
step. Specifically, after local `result.apply` succeeds, automation may consume
the current local `landing.prepare` gate, then continue to local `change.close`
when that is the fresh next gate.

## Users

- Developers using Workbench two-tier authorization on local projects.
- Future agents extending local landing or feedback flows who need a precise
  authority boundary.

## Acceptance Criteria

- AC-001: Scoped automation allows `landing.prepare` only when it is the current
  selected Change's enabled primary workflow gate and its target ids match the
  fresh confirmation queue payload.
- AC-002: `landing.prepare` remains local evidence/readiness generation only;
  it does not mutate source root, push, create PRs, merge, or perform remote
  landing.
- AC-003: After `landing.prepare`, automation may continue to `change.close`
  when the fresh next gate is local close, and it must stop at PR, remote,
  merge, post-merge, integration apply/discard, Harness evolution, or blockers.
- AC-004: Missing, stale, forged, or cross-Change landing targets fail closed,
  including missing `worktreeId` / `applyCheckId` where required.
- AC-005: Workbench UI/full-access eligibility marks `landing.prepare` as an
  allowed local automation gate and does not mark remote/PR/merge/integration
  or Harness gates as eligible.
- AC-006: Closeout records the later
  `workbench-confirmation-feedback-to-rework-v1` direction without claiming it
  is implemented.

## Non-Goals

- No automatic planning confirmation.
- No raw scheduler action automation.
- No integration apply/discard automation.
- No PR, remote, merge, post-merge, or Harness evolution automation.
- No confirmation-point feedback-to-rework implementation.
- No new workflow runtime, permission system, projection system, or evidence
  family.

## Constraints

- Reuse `automation-runtime`, Workbench current-gate revalidation, existing
  landing handlers, confirmation queue projection, and DecisionPanels.
- Preserve explicit `changeId` and target-id payload checks.
- Keep `完全访问权限` scoped to the current Change, accepted artifacts, source
  state, and current gate.
- Do not modify unrelated untracked `README.md`.

## Risks

- Treating local landing preparation as remote landing would widen authority
  incorrectly.
- Marking PR/remote/merge gates automation-eligible would create a dangerous
  permissions leak.
- Adding a separate landing automation path would duplicate current-gate
  revalidation and increase maintenance cost.
