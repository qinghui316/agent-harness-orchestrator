# workbench-worker-rework-validate-optional-target-helper-reuse

## Purpose

Reuse the existing Workbench action optional string target helper in the scheduler worker `rework-validate-first` action path. This continues Architecture Growth Control by removing feature-local stale target checks without changing scheduler runtime semantics, Workbench payload shape, or gate authority.

## Scope

In scope:

- Replace equivalent optional request-target comparisons in `planning.scheduler.worker.rework-validate-first` with `assertWorkbenchActionOptionalStringTarget`.
- Preserve required-id, prepared/latest SchedulerRun, runtime-state, stale ReworkResult/ReworkStart/ReworkPlan, code-gate, and already-created validation artifact checks that are not equivalent helper calls.
- Add focused module-boundary test coverage for helper adoption and the retained direct `existingValidation` checks.
- Record targeted verification scope and rationale.

Out of scope:

- `rework-audit-first`, scheduler runtime semantics, Workbench UI changes, new helpers, and broad test-suite restructuring.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed with active change incomplete only because closeout status was still pending before this update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.
- Independent implementation review - passed; no code findings, full `npm run test` not required for this helper-only slice.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff pointers only; no historical archive content promoted.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active/current-state wording updated only for this active change.
- Old experience retained / merged / retired / archive-only: historical helper-reuse evidence remains archive-only.

