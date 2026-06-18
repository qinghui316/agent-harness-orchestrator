# workbench-action-active-target-revalidation-reuse

## Purpose

Reduce repeated Workbench high-impact action active-Change target lookup code by introducing a small shared helper under the Workbench action owner.

This is an Architecture Growth Control / Core Mechanism Reuse slice. It strengthens the existing scoped action target revalidation path without changing action ids, payloads, ToolPolicyGate behavior, human gates, Goal Loop authority, Scheduler authority, route/API shapes, or domain-specific artifact validation.

## Scope

In scope:

- Add a focused Workbench action helper for resolving an explicit `changeId` to the matching active Change target.
- Refactor repeated `getActiveChanges` / `active.find` stale-target checks in `src/workbench/actions/boundary.ts` to use the helper.
- Preserve existing action-specific artifact, status, lineage, scope, and latest-target checks in their current branches.
- Record module-boundary and Core Mechanism Reuse review coverage.

Out of scope:

- No action id, payload schema, route/API, Workbench UI, or manager facade behavior change.
- No new scheduler loop, worker dispatch, Goal Loop execution authority, ToolPolicyGate bypass, or human-gate bypass.
- No extraction of scheduler lineage, Goal Loop packet/policy, planning bundle, decomposition, workflow graph, TaskQueue, or worker-result domain rules into the helper.
- No README handling.

## Current Status

Completed.

## Verification

- Plan self-evaluation: subagent Halley PASS before ECL creation; no pending evolution and no reference-source requirement for this narrow source convergence slice.
- `npm run typecheck`: passed.
- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/workbench-server.test.ts tests/unit/goal-loop-decision.test.ts tests/unit/web-app.test.tsx -t "stale|target|Goal Loop|runs a single TaskGraph task"`: passed, 42 tests.
- `npm run test:fast`: initial run had one `web-app.test.tsx` lookup failure; immediate single-test rerun passed; final full rerun passed, 29 files / 329 tests.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test:integration`: passed, 38 tests.
- `npm run test:workbench`: timed out twice in this environment without assertion output; related Workbench module/server and stale-target slices passed separately.
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-server.test.ts`: passed, 42 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.

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

- Documentation entropy check: applicable only to minimal active-handoff alignment in `AGENTS.md` and `docs/STATUS.md`; line counts stayed `AGENTS.md` 100 -> 100 and `docs/STATUS.md` 61 -> 61.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: current active path now names `harness/changes/active/workbench-action-active-target-revalidation-reuse/summary.md`; no archive ledger narrative was promoted.
- Old experience retained / merged / retired / archive-only: not applicable.
