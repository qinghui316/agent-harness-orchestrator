# Spec: workbench-integration-apply-outcome-completion-v1

## Goal

When a user manually applies a passed scheduler IntegrationCheck, AHO must move
the same Change to a truthful post-apply state. The old integration
apply/discard decision must stop being current, and the next visible primary
gate must be backed by existing outcome, scheduler completion, landing, close,
completion, or blocker evidence.

## Users

Workbench users running low-conflict multi-worktree work through scheduler
IntegrationCheck and IntegrationFix.

## Acceptance Criteria

- AC-001: After human `apply-check.apply` succeeds, the IntegrationCheck status
  is `applied`, and the old `apply-check.apply` / `apply-check.discard` gate is
  no longer current.
- AC-002: If the same-Change scheduler outcome has not been recorded yet,
  Workbench exposes the real `planning.scheduler.integration-outcome.reconcile`
  next gate instead of an unrelated planning gate.
- AC-003: After outcome reconcile, Workbench exposes the real
  `planning.scheduler.run.complete` gate; after scheduler completion, it exposes
  `landing.prepare`, `change.close`, completed state, or an explicit blocker.
- AC-004: Stale, missing, cross-change, source drift, or artifact hash drift
  integration apply payloads fail closed.
- AC-005: `完全访问权限` does not automatically consume integration
  apply/discard, remote, merge, PR, post-merge, or Harness evolution gates.
- AC-006: Projection evidence confirms `confirmationQueue.primary` and
  `decisionInspector.primary` align on the post-apply next gate.

## Non-Goals

- No new workflow runtime, scheduler executor, permission system, projection
  framework, child Change framework, or evidence family.
- No automatic integration apply/discard.
- No remote landing, merge, PR, post-merge, or Harness evolution automation.

## Constraints

- Reuse existing `integration-check`, scheduler outcome/completion, landing,
  close, Workbench read-model, and current-gate revalidation owners.
- Preserve same-Change guard for IntegrationCheck outcome.
- Source root mutation remains limited to explicit human integration apply in
  product flows.

## Risks

- The code path may already be mostly correct; the smallest valid change may be
  stronger fixture-backed projection tests plus closeout evidence.
- Unit fixtures must not fake a successful apply without an actual patch file
  and matching artifact hash.

