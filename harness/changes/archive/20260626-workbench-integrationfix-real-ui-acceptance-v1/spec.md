# Spec: workbench-integrationfix-real-ui-acceptance-v1

## Goal

Verify the real Workbench UI path for Codex-backed IntegrationFix after the
latest product closeout. AHO must demonstrate that a real aggregate
IntegrationCheck failure can be repaired in the integration fix checkout by
Codex-backed repair evidence, or it must record the first true blocker without
claiming success.

## Users

- A developer using Workbench on an external local project.
- Future AHO agents deciding whether the scheduler IntegrationFix branch is
  product-usable or still only mechanically tested.

## Acceptance Criteria

- AC-001: Workbench opens `E:\aho-accept\integrationfix-real-ui-v1\src` with
  runtime home `E:\aho-accept\integrationfix-real-ui-v1\home` and uses the
  browser UI as the primary acceptance surface.
- AC-002: A normal low-conflict demand reaches two same-Change worker
  worktrees, worker Codex artifacts, worker validation/audit evidence, and a
  ready `SchedulerIntegrationCandidate`.
- AC-003: The user manually confirms `planning.scheduler.integration-check.run`;
  raw scheduler and integration apply/discard actions are not auto-consumed by
  `完全访问权限`.
- AC-004: A real aggregate validation or audit failure, not marker-only
  deletion, triggers Codex-backed IntegrationFix in the integration fix
  checkout.
- AC-005: IntegrationFix records Codex run artifacts, repaired patch evidence,
  repaired diff hash, attempt status, and rerun aggregate validation/audit
  evidence.
- AC-006: If the repaired aggregate result passes, Workbench stops at the
  human integration apply/discard gate. If it fails, Workbench records a
  blocker classified as product path bug, Codex agent quality,
  validation/audit failure, source safety blocker, or environment/provider
  blocker.
- AC-007: Source root is not mutated before the explicit human integration
  apply gate; before/after external source `git status --short` is recorded.

## Non-Goals

- Implement a new workflow runtime, permission system, projection framework,
  scheduler executor, child Change framework, or evidence family.
- Auto-apply or auto-discard an IntegrationCheck.
- Run remote merge, push, PR, Harness evolution, raw scheduler automation, or
  a full parallel executor.
- Treat marker-only deterministic repair as real product acceptance.

## Constraints

- Use E-drive acceptance directories only.
- Keep AHO development checkout separate from the managed source under test.
- Reuse existing Workbench gates, current-gate revalidation, scheduler owners,
  validation/audit, Codex runtime, and `src/integration-check` owners.
- Product fixes must be minimal and attached to a concrete blocker found by
  the acceptance path.

## Risks

- Real Codex may produce worker outputs that do not trigger aggregate failure;
  that is inconclusive and requires adjusting the external acceptance demand,
  not a fake pass.
- Real Codex may fail for provider/auth/environment reasons; record as
  environment/provider blocker rather than weakening gates.
- A product blocker may appear before IntegrationFix; fix only the responsible
  owner needed to continue.
