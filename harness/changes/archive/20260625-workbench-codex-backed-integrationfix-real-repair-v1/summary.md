# workbench-codex-backed-integrationfix-real-repair-v1

## Purpose

Upgrade the existing IntegrationFix failure branch from marker-only bounded repair to real Codex-backed repair in the integration fix checkout. IntegrationFix remains owned by `src/integration-check`; the repaired result still must pass aggregate validation/audit before any human integration apply/discard gate appears.

## Scope

In scope:

- Default `runIntegrationFixAttempt` runs Codex workspace-write in the integration fix checkout.
- IntegrationFix attempts record repair mode, run id, run artifact refs, repaired patch hash, and summary.
- Aggregate validation/audit failure branches re-run aggregate validation/audit after repaired patches.
- Deterministic marker removal remains available only via explicit test runner injection.

Out of scope:

- Full workflow runtime, full parallel executor, scheduler loop, child Change, permission system, projection framework, or new evidence family.
- Automatic integration apply/discard, remote merge/push/PR, or Harness evolution.

## Current Status

Ready to close.

## Verification

- `npm run typecheck`: passed.
- `npx vitest run tests/unit/integration-fix-attempts.test.ts tests/unit/integration-check-apply-discard.test.ts`: passed.
- `npx vitest run tests/slow/workbench-apply-integration-flow.test.ts -t "runs integration fix on aggregate validation failure"`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run build`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed, no pending evolution.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed after active handoff alignment.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: active aligned, close readiness pending only this summary update.

`npm run test:workbench` was not run because this change does not alter Workbench projection/action contracts; targeted IntegrationCheck tests plus the slow apply/integration scenario cover the changed boundary.

## Acceptance Feedback

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: old slow marker test initially timed out because it waited on an unrelated audit-accept helper loop; the scenario now directly tests IntegrationCheck plus manual integration apply and passes in about 12 seconds.
- Screenshots / artifacts / run ids: no real UI acceptance claimed.
- External source/state safety: targeted unit test verifies source root status is unchanged while IntegrationFix edits only the integration fix checkout.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: a future E-drive real UI acceptance may trigger an aggregate failure and verify real Codex repair end to end.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: compact active pointer only; no archive ledger expansion.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active pointer added to `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`; close will replace it with archive pointer.
- Old experience retained / merged / retired / archive-only: marker-only IntegrationFix retained only as explicit deterministic test fixture; no longer described as product behavior.
