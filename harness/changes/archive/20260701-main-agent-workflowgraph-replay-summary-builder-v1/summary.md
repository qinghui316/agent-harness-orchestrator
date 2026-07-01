# main-agent-workflowgraph-replay-summary-builder-v1

## Purpose

Add a narrow, read-only `MainAgentWorkflowGraphReplaySummary` builder for the
main-agent orchestration migration. The builder aggregates current
WorkflowGraph / TaskQueue / role-loop evidence into an in-memory replay summary
so later decision policy work has one stable observation input instead of
reading scattered evidence directly.

This is not a recovery runtime. It does not write artifacts, modify SQLite,
change Workbench UI, execute actions, start runners, or alter Harness
authority.

## Scope

In scope:

- Add a read-only replay summary owner under `src/main-agent-orchestration/`.
- Keep canonical managers as the source of current state and use jsonl evidence
  only as historical explanation.
- Report evidence health and gaps for missing, malformed, old-schema, stale, or
  scope-mismatched evidence.
- Fix current `docs/STATUS.md` drift that still says the old
  `runTaskQueueSequence` wrapper exists.

Out of scope:

- UI, confirmation queue, action bridge, Scheduler/WorkerLease,
  IntegrationCheck, apply/close, remote, PR, merge, or Harness evolution.
- Free LLM decision policy, parallel execution, or normal Agent mode.
- Removing `rolePipeline`, `MainAgentLoopProjection`, or `role.pipeline.*`
  compatibility names.

## Current Status

Completed.

## Verification

- `npx vitest run tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts --reporter=dot` - passed.
- `npm run typecheck` - passed.
- `npx vitest run tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts --reporter=dot` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed with existing Vite chunk-size warning.
- `npm run test:workbench` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1` - passed.

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

- Documentation entropy check: `docs/STATUS.md` drift for the deleted
  `runTaskQueueSequence` wrapper was corrected.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: current handoff docs now point
  at the active replay summary change and no longer describe the deleted
  wrapper as present.
- Old experience retained / merged / retired / archive-only: not applicable.
