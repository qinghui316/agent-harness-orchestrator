# Phase 8E Remote Handoff PR Landing Boundary Split

## Purpose

Split the remote handoff / PR landing domain managers into owned modules while preserving behavior. This phase follows Phase 8D and targets the remaining high-impact remote delivery chain: PR review, PR feedback, remote landing, and post-merge sync/cleanup.

The phase is pure refactor. It does not add remote capability, CLI commands, Workbench actions, HTTP routes, scheduler behavior, parallel execution, automatic child Changes, ODWF JavaScript runtime, or cache/replay.

## Scope

In scope:

- Repair post-8D handoff docs so Phase 8E is active and Phase 8D is archived.
- Keep `src/pr-review/manager.ts`, `src/pr-feedback/manager.ts`, `src/remote-landing/manager.ts`, and `src/post-merge/manager.ts` as compatibility facades.
- Move schemas, artifact paths/repository helpers, provider/GitHub CLI adapters, state snapshot/readiness, handoff/attempt/result, rendering, and post-decision side-effect helpers behind owned modules.
- Preserve PR review, PR feedback, remote merge, post-merge sync, and branch cleanup action behavior.

Out of scope:

- New remote landing behavior, new reviewer assignment, merge queue changes, unattended merge, new action ids, new routes, new CLI commands, or runtime scheduling.
- Changes to artifact paths, JSON shape, Markdown artifact shape, event names, CLI stdout/stderr, Workbench confirmation public shape, action payload, decision/audit scope, thread storage, or SSE shape.
- Splitting `pr-draft`, `landing`, or `landing-queue` managers except for import adaptation.
- Unrelated untracked `README.md`.

## Current Status

Ready to close.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workbench-server.test.ts` passed.
- `npm run test -- tests/integration/cli-flow.test.ts` passed.
- `npx vitest run tests/unit/workbench.test.ts --test-timeout 60000` passed.
- `npm run test` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed with no pending evolution.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: no external remote or source-root mutation intended outside tests.
- Remote handoff acceptance: not applicable; remote handoff behavior must remain unchanged.
