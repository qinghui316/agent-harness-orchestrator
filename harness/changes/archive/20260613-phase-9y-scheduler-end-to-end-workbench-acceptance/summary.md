# Phase 9Y Scheduler End to End Workbench Acceptance

## Purpose

Phase 9Y verifies the scheduler path end to end at the Workbench boundary after Phase 9X added terminal SchedulerRun completion evidence. It is an acceptance hardening phase, not a new scheduler runtime phase: the goal is to prove that the existing Workbench action path, cold-read projections, confirmation queue, IntegrationCheck apply/discard handoff, SchedulerIntegrationOutcome, and SchedulerRunCompletion behave coherently for a user.

This phase follows the reference-project boundary lessons without copying their runtime models: Symphony-style dispatch/reconcile remains evidence-driven, AgentScope-style session/event/human-confirm boundaries remain auxiliary, and ODWF-style journal/replay concepts must not become a JavaScript workflow runtime or cache/replay authority inside AHO.

## Scope

In scope:

- Repair Phase 9X close handoff drift so docs record Phase 9X archived and Phase 9Y active.
- Add or tighten automated Workbench acceptance coverage for the full scheduler happy path through two worker outputs, IntegrationCheck handoff, existing apply/discard confirmation, SchedulerIntegrationOutcome, and SchedulerRunCompletion.
- Cover both applied and discarded terminal branches.
- Verify cold-read Workbench snapshot / projection recovery after key artifact transitions rather than relying on in-memory test return values.
- Verify confirmation queue honesty: IntegrationCheck `passed` exposes only existing `apply-check.apply` / `apply-check.discard`; scheduler outcome appears only after apply/discard terminal state; completion leaves no executable scheduler follow-up action.
- Verify source mutation boundaries: scheduler handoff/outcome/completion do not mutate source; discard does not mutate source; apply mutation remains owned by the existing IntegrationCheck apply gate.
- Record UI/user-surface acceptance evidence or an equivalent local Workbench projection record for the right-side confirmation queue and SchedulerRunCompletion details.

Out of scope:

- No new Workbench action, CLI command, HTTP route, lazy projection, scheduler runtime, scheduler loop, slot allocator, whole-wave dispatch, parallel executor, child Change, ODWF runtime, cache/replay, or apply/merge capability.
- No scheduler-owned apply/discard path and no new IntegrationCheck engine.
- No blocked/exhausted terminal closeout gate in this phase. If acceptance exposes a real closeout gap, record it as a follow-up Phase 9Z candidate.
- No broad facade implementation. Main acceptance helpers must stay in tests or owned fixtures; any product fix must stay in the relevant owner module.

## Current Status

Completed.

## Verification

- `npm run test -- tests/unit/scheduler-run-completion.test.ts` passed.
- `npm run test -- tests/unit/workbench.test.ts -t "carries a second scheduler worker|records discarded SchedulerRun completion"` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test -- tests/unit/workbench.test.ts` passed.
- `npm run test -- tests/unit/workflow-actions.test.ts` passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run test -- tests/unit/workbench-server.test.ts` passed.
- `npm run test` passed.
- `npm run build` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed: no pending evolution.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: initial combined `workbench.test.ts` + completion test command timed out; split focused run and full suite passed after assertions were corrected to allow terminal completion display while forbidding executable scheduler follow-up actions.
- Screenshots / artifacts / run ids: no manual screenshot; automated Workbench snapshot/lazy projection evidence covers right-side confirmation queue, SchedulerRunCompletion projection, and reload/cold-read recovery.
- External source/state safety: verified in tests that discard leaves source files and `git status --short --untracked-files=all` unchanged; scheduler outcome/completion actions report `sourceMutated: false`; apply path remains owned by existing `apply-check.apply`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: blocked/exhausted terminal closeout remains a follow-up probe only; Phase 9Y did not add a new closeout gate.

