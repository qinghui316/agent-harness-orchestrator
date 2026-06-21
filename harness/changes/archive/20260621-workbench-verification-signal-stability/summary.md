# workbench-verification-signal-stability

## Purpose

Stabilize the Workbench verification signal now that the manual-gated product loop has front-half and back-half evidence. The current blocker is not missing product abstraction; it is that `npm run test:workbench` can time out and `tests/unit/web-app.test.tsx` has shown an aggregate-only DOM/fetch mock flake, which makes later product changes hard to judge.

This change keeps scope on test topology, fixture isolation, package script membership, and necessary test waiting fixes. Product behavior is out of scope unless diagnostics expose a real Workbench bug.

## Scope

In scope:

- Split the large slow scheduler Workbench suite into explicit capability-domain slow suites.
- Preserve scheduler/runtime/source-safety assertions while improving aggregate observability.
- Fix the aggregate-only DOM fetch mock flake by making DOM state the primary UI success signal and fetch calls auxiliary evidence.
- Add the demand-to-execution golden-flow slow suite to the Workbench slow/aggregate gate.
- Clarify package scripts into Workbench unit, slow, scheduler slow, and aggregate layers.
- Record verification evidence for targeted suites, aggregate Workbench gates, product gates, and Harness checks.

Out of scope:

- Full-auto task mode.
- Scheduler loop, parallel executor, slot allocator, child Change auto creation, or whole-wave dispatch.
- New evidence family, summary layer, Goal Loop layer, or fake automation.
- Product behavior changes unless a real bug is found while stabilizing tests.
- Untracked `README.md`.

## Current Status

Completed.

Workbench verification signal stability is implemented and verified. The slow scheduler monolith was split into capability-domain suites, Workbench package scripts now expose unit / scheduler slow / slow / aggregate layers, the demand-to-execution golden-flow suite is included in the slow aggregate gate, App DOM run-graph assertions now use rendered DOM state as the primary success signal, and Workbench fixture cleanup is more tolerant of Windows file-handle delay.

Diagnostics also exposed one real controlled Scheduler guard defect. After `planning.scheduler.integration-check.run`, a recoverable post-step readiness warning can be expected because the next real user decision is the existing IntegrationCheck apply/discard gate. The continuation guard now allows only that recoverable warning to reach fresh current-transition revalidation; arbitrary warning evidence still fails closed.

## Verification

Passed:

- `npx vitest run tests/unit/controlled-scheduler-boundary-continuation.test.ts tests/unit/controlled-scheduler-step-contract.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx`
- `npm run test:workbench:slow:scheduler`
- `npm run test:workbench:slow`
- `npm run test:workbench`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`

Pending until close/handoff pass:

- Harness checks before close and after handoff updates: `lint-ecl`, `lint-encoding`, `harness-change reindex`, `harness-change status`, `harness-evolve check`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: an initial `npm run test:workbench:slow` run failed only at stale `workbench-goal-loop-prompt-flow` expectations for bare scheduler validation actions; after adapting that suite to controlled-advance primary gates, the suite and full slow gate passed.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: Workbench slow verification is now attributable and passing, but the scheduler slow suites remain long-running. Speed reduction is a follow-up performance/test-cost debt, not a current signal-trust blocker.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff docs were updated in the close pass to remove the active path and point to the archived change.
- Experience lifecycle result: not an auto-evolve change.
- Roadmap/current-direction stale language check: stale "fix Workbench aggregate flake" next-step wording was retired from current handoff docs.
- Old experience retained / merged / retired / archive-only: exact slow-suite timings and initial failed aggregate attempt remain archive-only; current docs retain only the stable aggregate gate and remaining slow-runtime cost debt.
