# main-agent-orchestration-legacy-facade-retirement-v1

## Purpose

Retire the remaining production use of the legacy
`runCodeValidateAuditSequence` facade. The current fixed role sequence remains
unchanged, but all role orchestration entrypoints move under
`src/main-agent-orchestration/` so old and new control paths do not keep
coexisting.

## Scope

In scope:

- Add explicit main-agent orchestration entrypoints for TaskRun attempts,
  source-refresh rework, and remote/PR feedback rework.
- Replace production imports/calls/exports of `runCodeValidateAuditSequence`.
- Remove the public `runLegacyCodeValidateAuditFacade` export.
- Update boundary/behavior tests to protect the new owner boundary.

Out of scope:

- No Workbench UI changes.
- No free-form main-agent loop, journal/recovery, scheduler expansion, parallel
  worker runtime, provider changes, or ordinary Agent mode.
- No action registry, automation allowlist, apply/close, remote, merge, PR, or
  Harness evolution authority changes.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed; Vite reported the existing chunk-size warning.
- `npm run test:workbench` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` reported this active change incomplete before task closeout; rerun required after closeout updates.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed with no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: latest handoff points to this active change during implementation; close will update it to the archive path.
- Old experience retained / merged / retired / archive-only: old `runCodeValidateAuditSequence` production surface retired.

