# Workbench Test Architecture Goal Loop Prompt Slow Suite Split

## Purpose

Split the remaining long-running Goal Loop prompt/runtime evidence tests out of the residual Workbench unit suite so Workbench test architecture continues moving toward smaller capability-domain files and slow scenario layering.

This is a test architecture convergence change only. It must not change Goal Loop, Workbench, scheduler, validation, audit, IntegrationCheck, ToolPolicyGate, stale revalidation, human gate, or product runtime behavior.

## Scope

In scope:

- Move the three actual `runCodexChat` / `runOrchestratorPlan` Goal Loop prompt/runtime evidence tests into `tests/slow/workbench-goal-loop-prompt-flow.test.ts`.
- Reuse existing shared Workbench fixtures for fake Codex, scheduler setup, temp project state, and JSONL reads.
- Add the new slow suite to the explicit sequential `test:workbench:slow` script.

Out of scope:

- Product runtime changes.
- Goal Loop / Workbench projection / prompt rendering behavior changes.
- Demand worker, maintenance, apply/IntegrationCheck, or read-model/projection test splits.
- New test framework or broad fixture rewrite.

## Current Status

Ready to close.

## Verification

- Pass: `npx eslint tests\slow\workbench-goal-loop-prompt-flow.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts`
- Pass after adding explicit timeout to the first moved slow scenario: `npx vitest run tests\slow\workbench-goal-loop-prompt-flow.test.ts` (3 tests)
- Pass: `npx vitest run tests\unit\workbench.test.ts` (100 tests)
- Pass: `npm run test:workbench:slow` (scheduler, remote landing, and Goal Loop prompt slow suites)
- Pass: `npm run test:workbench`
- Pass: `npm run typecheck`
- Pass: `npm run lint`
- Pass: `npm run test:fast`
- Pass: `npm run test:integration`
- Pass: `npm run build`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status` after task/review close-ready updates
- Pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check` (no pending evolution; 3 archived changes since last completion, threshold 5)

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

- Documentation entropy check: active handoff docs only; no historical ledger expansion planned.
- Experience lifecycle result: no Harness rule or canonical docs evolution; active handoff updates only.
- Roadmap/current-direction stale language check: `docs/STATUS.md` now points to this active split and removes "remaining Goal Loop prompt slow tests" from next candidates while active.
- Old experience retained / merged / retired / archive-only: latest completed remote landing split remains archive-linked; this active summary carries only current decision evidence.
