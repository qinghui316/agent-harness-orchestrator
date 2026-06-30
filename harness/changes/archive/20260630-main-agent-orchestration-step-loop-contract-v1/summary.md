# main-agent-orchestration-step-loop-contract-v1

## Purpose

Continue the main-agent orchestration architecture migration by replacing the
remaining fixed internal role loop in `src/main-agent-orchestration/runner.ts`
with an explicit step-loop contract:

```text
observe -> decide -> run one leaf -> record returned state -> observe
```

The external behavior remains unchanged. The default policy is still
deterministic coder / validator / auditor with at most one top-level automatic
rework after validation or audit failure. This is a migration seam for future
continuous main-agent orchestration, not a free-form agent loop or a new
Workflow/Scheduler runtime.

## Scope

In scope:

- Add an internal step-loop owner under `src/main-agent-orchestration/`.
- Refactor runner control flow so leaf execution runs exactly one role per
  step and the loop owner performs observe/decide/record progression.
- Preserve all current external entrypoint shapes and behavior for demand runs,
  TaskRun attempts, source-refresh rework, and PR/feedback rework.
- Add boundary and behavior tests that protect the new owner and prevent old
  sequence/facade drift.

Out of scope:

- No Workbench UI changes.
- No free-form LLM decision policy.
- No Workflow/Scheduler runtime, TaskQueue, WorkerLease, IntegrationCheck,
  apply/close, remote, merge, PR, or Harness evolution changes.
- No new persistent artifacts or workflow truth.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/main-agent-step-loop.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed; Vite reported the existing chunk-size warning.
- `npm run test:workbench` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after active handoff pointers were updated.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` reported tasks complete after checklist closeout.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed with no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded; an initial ECL lint run failed only because the newly active change had not yet been added to `AGENTS.md` / `docs/STATUS.md`, and passed after handoff alignment.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active handoff pointers in `AGENTS.md` and `docs/STATUS.md` were updated for the active change.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active change path is aligned; no product baseline wording changed.
- Old experience retained / merged / retired / archive-only: not applicable.

