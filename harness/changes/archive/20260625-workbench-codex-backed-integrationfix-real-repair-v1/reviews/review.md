# Review: workbench-codex-backed-integrationfix-real-repair-v1

Status: complete.

## Findings

No blocking findings.

## Verification

- `npm run typecheck`: passed.
- `npx vitest run tests/unit/integration-fix-attempts.test.ts tests/unit/integration-check-apply-discard.test.ts`: passed.
- `npx vitest run tests/slow/workbench-apply-integration-flow.test.ts -t "runs integration fix on aggregate validation failure"`: passed after removing unrelated audit-accept helper loop from that scenario.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run build`: passed.
- `npm run test:workbench`: not run; this change does not alter Workbench projection/action contracts, and targeted IntegrationCheck plus slow apply/integration evidence covers the changed boundary.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed, no pending evolution.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed after active handoff alignment.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: active aligned; close-ready pending only final summary update at review time.

## Complexity Deletion Review

- delete: removed the product assumption that marker deletion is the default IntegrationFix implementation.
- reuse: reused `runIntegrationFixAttempt`, Codex workspace-write args/parser/completion, code run artifact sessions, dependency bridge, aggregate validation/audit, integration artifact hashing, apply/discard source guards.
- yagni: avoided new workflow runtime, permission system, projection framework, evidence family, scheduler executor, child Change, and automatic apply/discard.
- shrink: kept test determinism as an injected repair runner instead of global env flags or a parallel service.
- net: small positive increase for real Codex evidence; removed fake success from the product path.

## Source Apply Safety Coverage

- Checked: IntegrationFix edits only the integration fix checkout.
- Source root before/after status is asserted unchanged in `tests/unit/integration-fix-attempts.test.ts`.
- Existing integration apply/discard guards remain in `src/integration-check/apply-discard.ts`.
- Integration apply/discard remains human-gated; no automation allowlist was changed.

## Runtime Bridge Boundary Coverage

- Codex is invoked through existing workspace-write capability detection, argv builder, JSONL parser, completion tracker, process runner, and run artifact session.
- IntegrationFix records `runId` and `runArtifactRefs` on the attempt; run artifacts include `run.json`, `codex-events.jsonl`, `last-message.md`, `diff.patch`, `diff-stat.txt`, and implementation summary.
- Codex unavailable, dependency bridge failure, source mutation, empty diff, or process failure records a failed attempt and does not produce a repaired artifact.

## Module Boundary Coverage

- Owner: `src/integration-check`.
- Touched modules: `fix-attempts.ts`, `service.ts`, `types.ts`, `schemas.ts`, `repository.ts`, `manager.ts`.
- Facade compatibility: existing `runIntegrationCheck(project, worktreeIds, expectedChangeId)` callers remain compatible; optional fourth argument is for tests/support.
- No Workbench UI, automation runtime, scheduler runtime, or apply/discard authority change was required.

## Core Mechanism Reuse Coverage

- Existing mechanisms strengthened: IntegrationCheck failure branch, Codex run artifacts, worktree dependency bridge, aggregate validation/audit retry, integration artifact hash lineage.
- New mechanism: none.
- Marker fixture behavior retained only through explicit test runner injection.

## Workbench User-Surface Honesty Coverage

- Product-visible Workbench gate semantics are unchanged.
- Workbench will show integration apply/discard only after IntegrationCheck status is passed and repaired aggregate validation/audit have succeeded.
- Failed repair leaves blocker/discard/evidence state and does not expose an apply gate.
- `完全访问权限` was not expanded to consume raw scheduler or integration apply/discard gates.

## Acceptance Feedback

- Real/manual UI acceptance: not performed in this change yet.
- Real Codex acceptance: product code now defaults to Codex-backed repair; targeted tests use injected deterministic runner where real Codex would be inappropriate.
- Real UI acceptance remains planned for E-drive sandbox if product owner wants end-to-end verification with a real aggregate failure.

## Close / Handoff Drift Coverage

- Handoff docs to update at close: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- `harness/changes/INDEX.json` must be regenerated, not hand-edited.
