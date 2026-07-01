# main-agent-controlled-scheduler-step-ownership-bridge-v1

## Purpose

Move the existing controlled Scheduler advance path behind a narrow main-agent
ownership bridge without changing user-visible behavior or Scheduler authority.
`planning.scheduler.controlled-advance.run` should still execute exactly one
existing controlled Scheduler transition, but the Workbench handler should no
longer call scheduler runtime directly.

## Scope

In scope:

- Add an independent `runMainAgentControlledSchedulerStep(...)` bridge.
- Route Workbench controlled-advance handling through that bridge.
- Keep `controlledSchedulerRoute` as non-executing handoff evidence only.
- Add tests for handler routing, bridge failure semantics, and module
  boundaries.

Out of scope:

- No UI, confirmation queue, action registry, revalidation, or allowlist change.
- No new Scheduler gate or action type.
- No automatic parallel execution, raw scheduler dispatch, apply, close, remote,
  PR, merge, or Harness evolution.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/main-agent-controlled-scheduler-step-bridge.test.ts tests/unit/workbench-module-boundaries.test.ts` passed.
- `npx vitest run tests/unit/controlled-scheduler-advance-post-step.test.ts tests/unit/controlled-scheduler-loop-step-owner.test.ts tests/unit/controlled-scheduler-boundary-continuation.test.ts tests/unit/controlled-scheduler-current-transition-owner.test.ts tests/unit/action-revalidation.test.ts tests/unit/main-agent-scheduler-candidate-assessment.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after closeout updates.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` reported close-ready.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` reported no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: initial Vitest command used unsupported
  `--runInBand`; rerun without that flag passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active/close handoff updates.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
