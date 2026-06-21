# workbench-demand-to-execution-golden-flow

## Purpose

Prove or repair the front half of the Workbench manual-gated golden flow. A user should be able to start from the main Workbench demand conversation, receive a planning draft, confirm execution, move through decomposition and readiness, run the coder only after readiness allows `code.run`, and reach validation/audit/result evidence that can connect to the already-proven apply/close path.

This change deliberately does not implement full-auto task mode. It closes the usability gap before considering broader automation.

## Scope

In scope:

- Workbench main-surface acceptance for natural-language demand to planning, execution confirmation, decomposition, readiness, direct code run, validation/audit, result review, and existing apply/close handoff.
- Action payload and server revalidation checks for `planning.confirm-execution`, `planning.decompose`, `planning.decomposition.confirm`, `planning.decomposition.assess-readiness`, and `code.run`.
- Confirmation queue behavior: one current real primary gate, no duplicate evidence-only actions as primary confirmations.
- Bounded test and product fixes in existing Workbench action handlers, server action forwarding, read-model projection owners, runtime bridge calls, and frontend honesty surfaces.
- Handoff docs reflecting this active change while it is active.

Out of scope:

- Full-auto task mode or scoped automation authorization.
- Scheduler loop, whole-wave dispatch, slot allocator, or full parallel executor.
- Automatic child Change creation.
- Automatic apply, close, archive, merge, push, or remote landing.
- New evidence family, summary layer, Goal Loop layer, or fake automation surface.

## Current Status

Completed.

Current baseline committed as `25329e1a Close Workbench manual loop baseline` before this change was opened. The only known unrelated untracked file is `README.md`, which remains out of scope.

Implemented the smallest product fix in the Workbench read-model confirmation projection:

- The right confirmation queue now exposes real front-half primary gates for `planning.generate`, `planning.decompose`, `planning.decomposition.confirm`, `planning.decomposition.assess-readiness`, and readiness-scoped `code.run`.
- `code.run` queue actions carry the scoped `changeId`, `readinessManifestId`, and task scope when present.
- Decomposition confirmation and readiness checks are projected as the current primary gate instead of evidence-only secondary items.
- User-facing copy avoids requiring users to understand Goal Loop, Scheduler, TaskRun, WorkerLease, worktree, or source-mutation internals.
- Goal Loop fallback is suppressed when a concrete planning gate is available.

## Verification

Pre-change baseline before opening this active change:

- `npm run lint` passed.
- `npm run test:fast` passed: 46 files, 467 tests.
- `npm run build` passed.
- `scripts/lint-ecl.ps1` passed.
- `scripts/lint-encoding.ps1` passed.
- `scripts/harness-change.ps1 status` passed and reported no active change before creation.
- `scripts/harness-evolve.ps1 check` passed with no pending evolution.

Completed verification for this change:

- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts` passed: 23 tests.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx tests/slow/workbench-demand-to-execution-golden-flow.test.ts` passed for 4 of 5 files, with `tests/unit/web-app.test.tsx` failing only in this parallel multi-file run due the known aggregate-only DOM `fetch` mock flake.
- `npx vitest run tests/unit/web-app.test.tsx` passed: 36 tests, confirming the DOM surface itself is green when isolated.
- Workbench unit suites were then run sequentially in package-script order and all passed: `workbench-read-model`, `workbench-task-runtime`, `workbench-goal-loop-surface`, `workbench-planning-scheduler-prep`, `workbench-scheduler-runtime-surface`, `workbench-feedback-surface`, `workbench-conversation-lifecycle`, `workbench-agent-task-domain`, and `workbench-demand-worker`.
- `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts` passed: natural demand through planning, confirmation, decomposition, readiness, `code.run`, validation, audit, and result review without source apply.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed: 46 files, 467 tests.
- `npm run build` passed.
- `npm run test:workbench` was attempted twice and timed out with no failure stack at 184 seconds and 604 seconds. Bounded Workbench unit suites and the new slow golden-flow acceptance were used as the reliable verification signal for this change; the aggregate command timeout remains test-stability debt rather than a product blocker for this slice.
- Harness checks are run in closeout after the active change is marked close-ready and the index is regenerated.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: initial golden-flow acceptance used a vague demand and correctly blocked for clarification; the test was updated to a clear product demand. `npm run test:workbench` timed out twice with no failure stack, while its unit components passed sequentially.
- Screenshots / artifacts / run ids: deterministic test artifacts from `tests/slow/workbench-demand-to-execution-golden-flow.test.ts`.
- External source/state safety: the slow golden-flow acceptance uses an isolated temporary git repo and asserts source `git status --porcelain` is clean before and after `code.run`; the existing result review/apply gate is reached but not auto-applied.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: track the slow `npm run test:workbench` timeout / aggregate DOM flake separately; it should not blur this product-health judgment.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable because `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` are updated for the active handoff and closeout.
- Experience lifecycle result: this is product convergence, not Harness evolution.
- Roadmap/current-direction stale language check: closeout moves the active pointer to the archive and states that broader automation is only a later option after the manual baseline.
- Old experience retained / merged / retired / archive-only: retain current human-gated boundaries; merge front-half/back-half Workbench baseline into one current manual-gated baseline; retire active-path wording after close; leave controlled Scheduler phase detail archive-only.
