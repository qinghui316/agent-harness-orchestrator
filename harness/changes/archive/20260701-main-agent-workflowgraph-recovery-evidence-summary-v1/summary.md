# main-agent-workflowgraph-recovery-evidence-summary-v1

## Purpose

Add a narrow read-only main-agent WorkflowGraph recovery evidence summary. It
does not create a second replay/policy layer and does not execute recovery. It
fills the current replay summary gap around evidence completeness:
WorkflowRun recovery-key freshness details, current WorkflowGraph/TaskQueue
TaskRun stage verdicts, and Run/Validation/Audit evidence refs.

## Scope

In scope:

- Add `MainAgentWorkflowGraphRecoverySummary` as a read-only, non-executing
  in-memory summary.
- Extend `recordMainAgentWorkflowGraphObservationAndReplay(...)` to return the
  recovery summary alongside existing observation and replay results.
- Repair small `docs/CURRENT-DEVELOPMENT-PLAN.md` drift around latest
  implementation and pending-evolution state.
- Add targeted unit and module-boundary coverage.

Out of scope:

- Workbench UI, transcript, right rail, Agent graph, confirmation card, or
  prompt-context changes.
- Confirmation queue, action registry, action revalidation, automation
  allowlist, ToolPolicyGate, Scheduler, WorkerLease, IntegrationCheck,
  Terminal, apply, close, remote, merge, PR, or Harness evolution changes.
- Calling TaskQueue/TaskRun/WorkflowRun resume/start lifecycle helpers or
  writing workflow/task/run state.

## Current Status

Completed.

## Verification

Passed:

- `npx vitest run tests/unit/main-agent-workflowgraph-recovery.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Meitner reviewed the first
  plan and required shrinking it to evidence completeness instead of a second
  replay/policy layer; revised plan was approved at 91/100.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; only the stale
  `CURRENT-DEVELOPMENT-PLAN` handoff text should change.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: applicable; latest
  implementation slice and pending-evolution state are corrected.
- Old experience retained / merged / retired / archive-only: implementation
  details remain in archive/tests; current docs retain only the next-step
  direction.
