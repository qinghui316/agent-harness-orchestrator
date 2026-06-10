# Phase 8R Future Feature Module Boundary Rule

## Purpose

Phase 8R hardens the long-term Harness rule that future product features must extend owned modules instead of putting main implementation logic back into broad compatibility facades. It is a Harness rule/template phase only: no product runtime, Workbench action, CLI command, route, UI, scheduler, parallel execution, child Change creation, ODWF JavaScript runtime, or cache/replay behavior changes are in scope.

This phase also repairs post-Phase 8Q handoff drift and records that the broad modularization track is complete. Future work should be feature-driven or boundary-defect-driven, with the next product capability track expected to be Parallel TaskGraph Readiness / Scheduler Contract Foundation.

## Scope

In scope:

- Repair Phase 8Q to Phase 8R handoff language in `AGENTS.md` and `docs/STATUS.md`.
- Strengthen `docs/ECL.md` with a long-term Future Feature Module Boundary Rule.
- Update `docs/BOUNDARIES.md` with default facade/shell files that should not receive new main implementation logic.
- Update change templates so future plans and reviews record owner modules, retained facade responsibilities, forbidden write-back locations, compatibility surfaces, and boundary tests.
- Lightly update `scripts/lint-ecl.ps1` to check for the new rule wording without adding fragile applicability heuristics.

Out of scope:

- Product code changes.
- New runtime authority, Workbench actions, CLI commands, HTTP routes, UI behavior, scheduler behavior, parallel execution, automatic child Changes, ODWF JavaScript runtime, or LLM cache/replay.
- File-size-based lint failures or automatic static inference of whether module-boundary coverage applies.
- Changes to unrelated untracked `README.md`.

## Current Status

Ready to close.

## Verification

- `rg "Phase 8Q is active|Current active phase: Phase 8Q|harness/changes/active/phase-8q" AGENTS.md docs`: passed; no stale Phase 8Q active claim.
- `rg "Phase 8R|Future Feature Module Boundary Rule|owner module|compatibility facade|forbidden write-back" AGENTS.md docs harness/changes/active`: passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`: passed, 27 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 23 files / 321 tests.
- `npm run build`: passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
