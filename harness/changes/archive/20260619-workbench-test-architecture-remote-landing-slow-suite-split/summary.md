# Workbench Test Architecture Remote Landing Slow Suite Split

## Purpose

Split one remaining Workbench test-domain chain out of the overloaded
`tests/unit/workbench.test.ts` file. This change targets remote landing and
provider handoff flow coverage so the residual Workbench unit suite is smaller
and slow provider scenarios are run through the Workbench slow-suite layer.

## Scope

In scope:

- Move remote landing / PR draft / PR review submit / remote merge / landing
  queue / post-merge / PR review feedback tests into
  `tests/slow/workbench-remote-landing-flow.test.ts`.
- Reuse and minimally extend `tests/unit/workbench/fixtures.ts` for shared fake
  GitHub CLI setup.
- Update Workbench npm test scripts for all `tests/slow/workbench-*.test.ts`
  suites.

Out of scope:

- Product runtime behavior changes.
- Scheduler, demand worker, maintenance, Goal Loop, apply, or IntegrationCheck
  test splits.
- New local test framework abstractions.

## Current Status

Ready to close.

## Verification

- `npx eslint tests\slow\workbench-remote-landing-flow.test.ts tests\unit\workbench\fixtures.ts tests\unit\workbench.test.ts` - passed.
- `npx vitest run tests\slow\workbench-remote-landing-flow.test.ts` - passed, 6 tests.
- `npx vitest run tests\unit\workbench.test.ts` - passed, 103 tests.
- `npm run test:workbench:slow` - initial glob script failed on Windows/Vitest; after switching to explicit sequential files, passed, 9 tests.
- `npm run test:workbench` - initial parallel multi-file run exposed Workbench heavy-test contention and one Goal Loop timeout; after switching to sequential residual + slow scripts, passed, 112 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed, 346 tests.
- `npm run test:integration` - passed, 38 tests.
- `npm run build` - passed.
- `npm run test` - passed through `test:fast && test:integration && test:workbench`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed, no pending evolution before close.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: glob-based Workbench slow script failed because Vitest did not expand `tests/slow/workbench-*.test.ts` on Windows; fixed by using explicit file lists. Parallel multi-file `test:workbench` overloaded a long residual Goal Loop test; fixed by running residual and slow suites sequentially.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to current handoff updates only; `AGENTS.md` and `docs/STATUS.md` now point to this active change and keep history archive-linked.
- Experience lifecycle result: no Harness evolution or reusable process rule promoted; the Windows glob failure is recorded in this summary/review as change-local evidence.
- Roadmap/current-direction stale language check: active handoff points to the remote landing split while next candidates exclude the now-active remote landing item.
- Old experience retained / merged / retired / archive-only: retained in active summary/review until close, then archive-only.
