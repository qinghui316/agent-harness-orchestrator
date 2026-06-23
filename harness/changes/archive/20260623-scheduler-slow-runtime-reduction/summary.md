# scheduler-slow-runtime-reduction

## Purpose

Reduce the runtime cost and hang risk of the Workbench scheduler slow suites.
The current manual-gated Workbench/Codex loop is accepted; this change focuses
on making the scheduler verification signal usable without dropping
scheduler/runtime/source-safety coverage.

## Scope

In scope:

- Diagnose the four `tests/slow/workbench-scheduler-*.test.ts` files
  individually and record runtime/process evidence.
- Refactor scheduler slow fixtures so later-stage scenarios can start from
  controlled canonical intermediate state instead of replaying the full worker
  chain.
- Keep one end-to-end two-worker scheduler golden flow.
- Preserve target-id, stale-revalidation, runtime-event, worktree, validation,
  audit, integration, completion, and source-safety assertions.
- Update package script membership or test topology only when it improves the
  explicit scheduler slow gate.

Out of scope:

- Product behavior expansion.
- Full-auto task mode, scheduler loop, whole-wave dispatch, slot allocator,
  child Change creation, automatic apply/merge/close, or remote push/merge.
- Weakening or deleting scheduler/runtime/source-safety assertions to make the
  suite faster.

## Current Status

Ready to close.

Scheduler discard-completion no longer replays the full two-worker chain. It
now starts from a controlled seeded scheduler integration handoff that writes
the canonical artifacts consumed by production projections/actions, then still
executes the real discard, completion, controlled-step, Goal Loop, and terminal
handoff paths under test. The one full two-worker scheduler integration golden
flow remains intact.

The work also fixed two verification-signal issues exposed by aggregate runs:
readonly/planning runs no longer keep `rolePipeline.status` stuck at
`running`, so `planning.confirm-execution` is not hidden after a completed
planning draft; and the App DOM test now waits for the rendered Agent run graph
instead of a fragile aggregate-only fetch-spy timing condition.

Remaining debt is explicit: `workbench-scheduler-two-worker-integration-flow`
is still the slowest retained end-to-end golden path, and full
`npm run test:workbench` still exceeded the tool window. That is recorded as
aggregate runtime-cost debt, not as a product failure or a fake pass.

## Verification

- Passed: `npx vitest run tests/slow/workbench-scheduler-discard-completion-flow.test.ts`
  (final focused run: test body about 10-12s).
- Passed: `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`
  after the Workpad running-state projection fix.
- Passed: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`.
- Passed: `npx vitest run tests/unit/web-app.test.tsx`.
- Passed: `npm run test:fast`.
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Passed: `npm run test:workbench:slow:scheduler`; final member timings were
  roughly 475.6s two-worker golden, 10.2s discard completion, 103.0s worker
  rework, and 72.7s worker runtime.
- Timed out: `npm run test:workbench` after about 1,504s with no assertion
  failure output. The retained split evidence above passed; residual issue is
  aggregate runtime cost. The timed-out Vitest/tinypool process tree was
  identified and cleaned up.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
  (`close-ready`).
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
  (no pending evolution; four archived changes since last completion).

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: prior planning diagnostics showed
  `workbench-scheduler-discard-completion-flow.test.ts` could exceed an
  ordinary tool window when it replayed the full upstream worker chain. Full
  `npm run test:workbench` still exceeded the tool window after this change;
  split gates passed and the orphaned test process tree was cleaned up.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: `AGENTS.md` and `docs/STATUS.md` currently point
  at this active change; close should replace them with the archive path.
  `docs/CURRENT-DEVELOPMENT-PLAN.md` already states the scheduler runtime-cost
  direction as a verification architecture target.
- Experience lifecycle result: retain the rule that Workbench aggregate
  timeouts are verification topology/runtime-cost debt; this change provides a
  concrete fixture pattern for later-stage scheduler tests. Do not promote
  scheduler loop or full-auto authority from this evidence.
- Old experience retained / merged / retired / archive-only: detailed timing
  history belongs in this summary/review and the generated index, not in
  `AGENTS.md` or `docs/STATUS.md`.
