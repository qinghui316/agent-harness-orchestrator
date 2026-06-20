# workbench-landing-review-artifact-selection-helper-reuse

## Purpose

Converge repeated Workbench landing review artifact selection into one small helper. Landing confirmation projections and landing-related action handlers currently repeat local `merge-review.md` / artifact-ref fallback choices, which makes future remote or landing surfaces easy to drift.

This change keeps behavior unchanged while giving the landing review display rule one owner. It is an Architecture Growth Control / Core Mechanism Reuse step, not a new landing, PR, merge, scheduler, Goal Loop, ToolPolicy, or human-gate capability.

## Scope

In scope:

- Add a small landing-specific Workbench artifact selection helper.
- Use it from `src/workbench/projections/read-model/confirmation/landing.ts`.
- Use it from `src/workbench/actions/handlers/remote-handoff.ts` for landing review thread artifacts.
- Add targeted boundary coverage for helper behavior and import direction.

Out of scope:

- No action id, payload, confirmation, ToolPolicy, remote provider, PR, merge, landing queue, source apply, scheduler, Goal Loop, or maintenance behavior changes.
- No broad artifact framework or action-result facade expansion.
- No full Workbench test-topology refactor.

## Current Status

Completed.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts` (40 tests)
- `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts` (6 tests)
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Drift grep for repeated `merge-review.md` / `artifactRefs[1]` selection in touched Workbench landing files.

Full `npm run test`, full `npm run test:workbench`, and unrelated slow Workbench suites were skipped because this change is a bounded Workbench landing artifact display helper migration. It does not change action dispatch, payload contracts, ToolPolicyGate, human gates, landing package generation, remote provider behavior, scheduler, Goal Loop, source apply, package scripts, or aggregate runtime behavior.

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

- Documentation entropy check: applicable only to active handoff alignment. `AGENTS.md` stayed at 108 lines, `docs/STATUS.md` stayed at 131 lines, and no historical phase narrative was promoted.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: `AGENTS.md` and `docs/STATUS.md` now point to the active change; no stale `none` active-state text remains.
- Old experience retained / merged / retired / archive-only: not applicable.

