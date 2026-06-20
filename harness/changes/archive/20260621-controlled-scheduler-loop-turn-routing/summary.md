# controlled-scheduler-loop-turn-routing

## Purpose

Record a reusable SchedulerRun-scoped controlled-loop turn route summary on the existing controlled Scheduler step evidence. The route summary turns the current post-step handoff, post-step Goal Loop evaluation/readiness evidence, and concrete scheduler result summary into one read-only route record that later controlled-loop runtime work can consume.

This change advances the controlled Scheduler loop direction without adding a loop runtime. It keeps the existing one-human-confirmation-per-gate flow and reuses Goal Loop posture vocabulary instead of creating a feature-local loop state machine.

## Scope

In scope:

- Add a scheduler-runtime-owned route summary helper for controlled Scheduler post-step evidence.
- Store the optional route summary on `SchedulerControlledStepEvidence`.
- Move controlled-step concrete result summarization out of the Workbench handler and into scheduler-runtime ownership.
- Project and render the route summary in existing markdown, Workbench read model, and read-only frontend controlled-step evidence card surfaces.
- Add targeted tests for route classification/mapping, controlled advance recording, repository/projection, and real App DOM display.

Out of scope:

- New Workbench actions, server routes, ToolPolicy paths, confirmation items, or queue priority changes.
- Automatic scheduler loop runtime, hidden continuation, whole-wave dispatch, slot allocation, or full parallel executor behavior.
- Source apply, merge, close/archive, remote landing, IntegrationCheck bypass, validation/audit bypass, or Harness evolution automation.
- A new Goal Loop state machine or a new artifact family.

## Current Status

Completed.

## Verification

Passed:

- `npx vitest run tests\unit\scheduler-controlled-loop-turn.test.ts tests\unit\scheduler-controlled-step-evidence.test.ts tests\unit\controlled-scheduler-advance-post-step.test.ts tests\unit\web-app.test.tsx` (4 files, 48 tests)
- `npx vitest run tests\unit\workbench-scheduler-runtime-surface.test.ts` (2 tests)
- `npx vitest run tests\unit\workbench-goal-loop-surface.test.ts` (23 tests)
- `npx vitest run tests\unit\workbench-read-model.test.ts` (24 tests)
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast` (37 files, 393 tests)
- `npm run build`

Final Harness checks passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: one initial `web-app.test.tsx` run observed an unrelated transient missing `agent-run-graph` assertion in a non-touched case; targeted rerun and later `test:fast` passed.
- Screenshots / artifacts / run ids: deterministic real App DOM coverage in `tests/unit/web-app.test.tsx`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`; updates are limited to current active/close handoff, current baseline, and next product direction.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active change and next product direction are aligned before close.
- Old experience retained / merged / retired / archive-only: not applicable.
