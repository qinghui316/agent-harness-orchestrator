# Workbench Test Architecture Demand Worker Unit Domain Split

## Purpose

Split the DemandWorker Workbench test cluster out of the residual Workbench monolith so Workbench test architecture continues moving toward smaller capability-domain files.

This is a test architecture convergence change only. It must not change DemandWorker, Workbench, scheduler, validation, audit, IntegrationCheck, ToolPolicyGate, stale revalidation, human gate, or product runtime behavior.

## Scope

In scope:

- Move the 10 DemandWorker Workbench tests into `tests/unit/workbench-demand-worker.test.ts`.
- Reuse existing shared Workbench fixtures for temp project state and planning bundle setup.
- Update npm script staging so the new suite remains part of `test:workbench` and is excluded from `test:fast`.

Out of scope:

- Product runtime changes.
- DemandWorker manager/action/projection behavior changes.
- Maintenance, apply/IntegrationCheck, read-model/projection, AgentTask, Goal Loop, scheduler, or remote test splits.
- New test framework or broad fixture rewrite.

## Current Status

Ready to close.

Implemented as a test architecture convergence slice. The 10 DemandWorker Workbench tests now live in `tests/unit/workbench-demand-worker.test.ts`; the residual Workbench monolith is reduced to 90 tests. Product runtime behavior was not changed.

## Verification

Passed:

- `npx eslint tests\unit\workbench-demand-worker.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts`
- `npx vitest run tests\unit\workbench-demand-worker.test.ts`
- `npx vitest run tests\unit\workbench.test.ts`
- `npm run test:workbench`
- `npm run test:fast`
- `npm run typecheck`
- `npm run lint`
- `npm run test:integration`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: future test-architecture convergence stages should use a slightly larger work package, such as one complete capability domain or a group of adjacent domains, rather than one very small split.
- Retries or environment failures: first direct `npm run test:workbench` shell invocation timed out at the tool's 10-minute limit; the same script passed in a background run with a longer wait window.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff docs only; no historical ledger expansion planned.
- Experience lifecycle result: no new product memory or Harness evolution facts; this change only records the active split and next-stage granularity feedback.
- Roadmap/current-direction stale language check: current handoff remains aligned with Workbench test convergence.
- Old experience retained / merged / retired / archive-only: no archive-ledger content promoted; current docs contain only active handoff state.
