# Spec: workbench-codex-backed-integrationfix-real-repair-v1

## Goal

Upgrade the existing IntegrationFix failure branch from marker-only repair to a real Codex-backed bounded repair attempt in the integration fix checkout.

## Users

- Workbench users running low-conflict scheduler work that reaches an IntegrationCheck failure.
- Maintainers reviewing integration repair evidence before manually applying or discarding the combined result.

## Acceptance Criteria

- AC-001: When IntegrationCheck fails because of patch conflict, aggregate validation failure, or aggregate audit failure, the existing `runIntegrationFixAttempt` owner can run a Codex-backed repair in an integration fix checkout.
- AC-002: IntegrationFix Codex artifacts include run metadata, Codex event/output artifacts, repaired diff, diff stat, and a link from `IntegrationFixAttempt`.
- AC-003: Source root remains unchanged during IntegrationFix; only the integration fix checkout may be edited.
- AC-004: Codex unavailable, runner failure, or empty repaired diff records a failed attempt and does not expose an apply gate.
- AC-005: Aggregate validation/audit are re-run after a repaired patch before IntegrationCheck is marked passed.
- AC-006: Deterministic marker repair remains available only as an explicit test helper, not the default product implementation.
- AC-007: Workbench and scheduler continue to require manual IntegrationCheck and manual integration apply/discard; `完全访问权限` does not auto-consume integration apply/discard.

## Non-Goals

- No new workflow runtime, scheduler executor, permission system, projection framework, child Change, or evidence family.
- No full parallel executor, slot allocator, remote merge/push/PR, or automatic integration apply/discard.
- No product default that treats marker removal as real repair success.

## Constraints

- Reuse existing Codex workspace-write capability, worktree dependency bridge, IntegrationCheck aggregate validation/audit, confirmation queue, and current apply/discard guards.
- Repair is bounded to the integration fix checkout.
- Tests may inject a deterministic repair runner for repeatable fixture coverage.

## Risks

- Real Codex availability can vary by environment; failures must be recorded as blockers, not fake passes.
- Slow release tests can accidentally include unrelated confirmation queue loops; targeted service tests should cover the changed owner directly.
