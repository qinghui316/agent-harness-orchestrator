# workbench-scheduler-integration-outcome-handoff-target-helper-reuse

## Purpose

Reuse the existing Workbench action latest-target helper for the `planning.scheduler.integration-outcome.reconcile` SchedulerIntegrationCheckHandoff target check. This continues Architecture Growth Control by removing one more action-local stale target branch while preserving scheduler runtime, IntegrationCheck, and apply/discard semantics.

## Scope

In scope:

- Replace the hand-written latest SchedulerIntegrationCheckHandoff comparison in `src/workbench/actions/boundary.ts` with `assertLatestWorkbenchActionTarget`.
- Keep required `schedulerIntegrationCheckHandoffId`, prepared/latest SchedulerRun, runtime-state, snapshot/reservation stale checks, latest candidate scope, handoff scope, IntegrationCheck terminal-state handling, applyCheck optional helper, and worktreeIds helper unchanged.
- Add focused module-boundary test coverage for the helper adoption.
- Record targeted verification scope and close-ready review evidence.

Out of scope:

- Scheduler runtime behavior, IntegrationCheck execution, Workbench UI/projection payloads, action handler behavior, Goal Loop policy, source/apply paths, new helpers, reference-project updates, and broad test-suite restructuring.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed with active change still incomplete before final review closeout.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution, 1/5 archive count.
- Independent close-ready review - first pass found closeout metadata gaps only; code, tests, verification scope, and handoff alignment were accepted. Metadata gaps were fixed before close.
- Full `npm run test` skipped because this helper-only slice changes no scheduler runtime semantics, payload shape, projection, UI behavior, action handler behavior, source/apply path, validation/audit artifact shape, IntegrationCheck behavior, or release-risk surface.

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

- Documentation entropy check: active handoff pointers only; no historical archive content promoted. Current line counts: `AGENTS.md` 154, `docs/STATUS.md` 149.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
