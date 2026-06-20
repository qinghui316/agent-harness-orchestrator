# controlled-scheduler-single-step-runner

## Purpose

Implement the first controlled Scheduler runtime step: a user-confirmed wrapper action that uses fresh Goal Loop packet/controller/preflight evidence to execute exactly one existing concrete scheduler gate, then stops.

This advances the Goal-driven Adaptive Loop / controlled Scheduler direction as product functionality while preserving current workflow truth, ToolPolicyGate, stale revalidation, SchedulerRun evidence, IntegrationCheck/apply boundaries, and human gates.

## Scope

In scope:

- `planning.scheduler.controlled-step.run` workflow action registration, scope validation, high-impact ToolPolicy/revalidation membership.
- Owned controlled-step guard/conversion logic for fresh Goal Loop-assisted scheduler gates.
- Thin Workbench scheduler handler that delegates once to existing scheduler handlers.
- Workbench confirmation projection/copy that avoids duplicate primary execution affordances.
- Targeted unit and slow scheduler-flow verification.

Out of scope:

- Full scheduler loop runtime, hidden continuation, whole-wave dispatch, slot allocation, source apply/discard, close/archive, remote landing, child Change creation, or Harness evolution automation.
- New persistent workflow-truth artifact family.
- Broad documentation, maintenance, or architecture-only convergence work.

## Current Status

Completed.

Implemented and verified. Ready to close/archive.

## Verification

Passed.

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npx vitest run tests/slow/workbench-scheduler-flow.test.ts -t "carries a second scheduler worker"`
- `npm run test:fast`
- `npm run lint`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: close-ready review noted summary close status and untracked owner module staging as close blockers; summary was updated and `src/workflow-scheduler/controlled-step.ts` must be included in the landing set.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: current handoff only; `AGENTS.md` and `docs/STATUS.md` point to the active change before close.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
