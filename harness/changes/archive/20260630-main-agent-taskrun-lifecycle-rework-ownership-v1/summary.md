# main-agent-taskrun-lifecycle-rework-ownership-v1

## Purpose

Move TaskRun bounded rework ownership into `src/main-agent-orchestration` while preserving existing TaskRun, TaskQueue, and WorkflowRun lifecycle owners.

The external behavior stays the same: a TaskRun still runs coder, validator, auditor, and at most one bounded rework after validation or audit failure. The architectural change is that the main-agent loop now observes the finished attempt and decides whether to retry with `rework-coder`; workflow-runtime wrappers no longer recursively trigger bounded rework.

## Scope

In scope:

- Add a main-agent TaskRun lifecycle entrypoint for initial attempt, finish, bounded rework decision, retry, and final finish.
- Keep `runMainAgentTaskRunAttempt` as a single-attempt contract.
- Route TaskQueue item execution through the new lifecycle while preserving queue ownership and WorkflowRun sync.
- Preserve stage-resume behavior for completed, continue-validation, continue-audit, and blocked verdicts.
- Remove direct bounded-rework execution from `task-run-sequence.ts` and `stage-resume-runner.ts`.

Out of scope:

- Workbench UI changes.
- Free-form LLM main-agent decision logic.
- Scheduler, parallel worker, IntegrationCheck, remote, PR, merge, apply, close, or Harness evolution authority changes.
- Confirmation queue, action registry, revalidation, or automation allowlist changes.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/main-agent-step-loop.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- Harness checks passed after handoff alignment: `lint-ecl`, `lint-encoding`, `harness-change reindex/status`, `harness-evolve check`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent review flagged TaskQueue retry binding and stage-resume compatibility as required constraints.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active pointer updated in `AGENTS.md` and `docs/STATUS.md`; close will move this to archive-only latest context.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: old workflow-runtime bounded rework recursion is being retired as an implementation path; behavior remains.
