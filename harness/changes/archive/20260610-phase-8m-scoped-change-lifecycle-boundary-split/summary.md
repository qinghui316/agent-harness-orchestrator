# Phase 8M Scoped Change Lifecycle Boundary Split

## Purpose

Repair Change metadata scope boundaries and split `src/change/manager.ts`
into owned domain modules behind a compatibility facade. A Change directory,
its `change.json`, Workbench topic projection, and thread-log import must agree
on the canonical Change id so forged or misplaced metadata cannot become
selected-demand truth.

This is a scoped bug fix plus refactor. It does not add runtime capability,
CLI commands, Workbench actions, HTTP routes, scheduler behavior, parallel
execution, automatic child Changes, ODWF JavaScript runtime, or cache/replay.

## Scope

In scope:

- Repair post-8L handoff drift in `AGENTS.md`, `docs/STATUS.md`,
  `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, and `docs/BOUNDARIES.md`.
- Add shared Change metadata reader/guard logic for active, parking, and
  archive locations.
- Fail closed when active/parking directory names do not match
  `change.json.id` or metadata state does not match the directory state.
- Preserve valid archive lookup while rejecting malformed archived metadata.
- Route Workbench topic summary/detail, topic resolver, and thread-log
  canonical id reads through the same metadata guard.
- Split Change schemas, paths, metadata, templates, repository, creation,
  status, close-gate, lifecycle, and guards behind `src/change/manager.ts`.

Out of scope:

- Splitting `src/run/manager.ts`.
- Product runtime features, new routes/actions/commands, source-root apply
  behavior, scheduler/parallel execution, multi-Change auto creation, ODWF
  runtime, or cache/replay.
- Editing unrelated `README.md`.

## Current Status

Completed. Ready to close when requested.

## Verification

Passed:

- `npm run test -- tests/unit/change.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/integration/cli-flow.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: `tests/unit/workbench.test.ts` needed a longer timeout when run alone; the test passed on rerun and in full `npm run test`. `tests/integration/cli-flow.test.ts` exposed a refactor regression in external-local close memory resolution; fixed by passing the already resolved memory through lifecycle helpers, then reran successfully.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
