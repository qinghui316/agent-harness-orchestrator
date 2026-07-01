# main-agent-workflowgraph-observation-cleanup-queue-wrapper-removal-v1

## Purpose

Clean up the main-agent WorkflowGraph observation seam before adding a
recovery/replay layer. This change fixes the created/unbound WorkflowRun state
so it is not reported as a running queue, and removes the legacy
`runTaskQueueSequence` wrapper/export now that production Workbench actions call
`runMainAgentTaskQueueLifecycle` directly.

## Scope

In scope:

- WorkflowGraph observation decision semantics for created/unbound WorkflowRun.
- `runTaskQueueSequence` wrapper/export removal.
- Unit and module-boundary tests that enforce the single TaskQueue lifecycle
  entrypoint.

Out of scope:

- Recovery/replay summary owner.
- Workbench UI, confirmation queue, action registry, automation allowlist,
  Scheduler, WorkerLease, IntegrationCheck, apply/close, remote, PR, merge, or
  Harness evolution behavior.
- `rolePipeline`, `MainAgentLoopProjection`, or `role.pipeline.*` action-name
  retirement.

## Current Status

Completed.

## Verification

- Passed: `npx vitest run tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-task-runtime.test.ts`.
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run test:fast`.
- Passed: `npm run build` (existing Vite chunk-size warning only).
- Passed: `npm run test:workbench`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`.
- Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`.

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

- Documentation entropy check: updated active-change pointers in `AGENTS.md` and
  `docs/STATUS.md`; no product baseline or roadmap content changed.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
