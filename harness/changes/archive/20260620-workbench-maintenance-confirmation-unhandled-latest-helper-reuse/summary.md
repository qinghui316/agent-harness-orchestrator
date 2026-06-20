# workbench-maintenance-confirmation-unhandled-latest-helper-reuse

## Purpose

Reuse the Workbench read-model projection summary owner for selecting the latest eligible maintenance confirmation target that has not already been handled.

This is a narrow Architecture Growth Control change. It continues the earlier projection-summary reuse work, but does not repeat it: the target is the repeated `handled ids + eligibility + latest candidate` selection pattern in maintenance confirmation projection code, not basic timestamp sorting.

## Scope

In scope:

- Add a pure read-model projection helper in `src/workbench/projections/read-model/projection-summary.ts`.
- Use that helper in `src/workbench/projections/read-model/confirmation/maintenance.ts` for canonical update decision, canonical patch gate, and canonical patch apply confirmation target selection.
- Keep maintenance IO, fallback order, action payloads, confirmation copy, and human-gate semantics in the maintenance confirmation module.
- Add or update focused tests that prove helper semantics and maintenance confirmation behavior.

Out of scope:

- No new maintenance queue framework.
- No change to workflow truth, ToolPolicyGate, Validation, Audit, IntegrationCheck, Scheduler, Goal Loop, source apply, or Harness evolution authority.
- No change to Workbench UI copy, action ids, action types, target payload ids, or fallback order.
- No broad Workbench test architecture split.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts` - passed.
- `npx vitest run tests/slow/workbench-maintenance-flow.test.ts -t "selects newest eligible maintenance confirmation records"` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npx vitest run tests/unit/goal-loop-decision.test.ts -t "supports current integration candidate handoff"` - passed after updating stale test expectations for the current shared target-scope error vocabulary.
- `npm run test:fast` - passed after the stale Goal Loop test expectation was updated.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed after closeout updates; STATUS aligned and close-ready.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

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

- Documentation entropy check: active handoff fields updated only for this change. Current line counts: `AGENTS.md` 108, `docs/STATUS.md` 129, `docs/ECL.md` 294.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: checked `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`; no roadmap edit needed for this narrow projection helper reuse.
- Old experience retained / merged / retired / archive-only: not applicable.
