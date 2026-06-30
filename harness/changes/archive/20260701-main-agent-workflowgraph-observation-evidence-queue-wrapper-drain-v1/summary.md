# main-agent-workflowgraph-observation-evidence-queue-wrapper-drain-v1

## Purpose

Add a graph-level, non-executing main-agent observation/evidence seam above the
existing role and queue step loops. The new owner records where the selected
Change is in the WorkflowGraph / TaskQueue chain without executing actions or
becoming workflow truth.

Drain production use of the legacy `runTaskQueueSequence` name by calling the
main-agent TaskQueue lifecycle directly from Workbench handlers. The old export
stays as a thin compatibility wrapper for one more change window.

## Scope

In scope:

- `MainAgentWorkflowGraphObservation` and
  `MainAgentWorkflowGraphDecisionEvidence` reader/writer/schema.
- Stage-level graph decisions for missing decomposition/readiness/proposal/graph,
  queue start readiness, queue running/paused/blocked/completed, stale, and wait.
- Recording graph observations after planning graph artifacts and queue
  lifecycle terminal states.
- Replacing production Workbench imports of `runTaskQueueSequence` with
  `runMainAgentTaskQueueLifecycle`.
- Boundary tests that prevent graph evidence from becoming UI, action, scheduler,
  or queue-item decision authority.

Out of scope:

- Workbench UI changes.
- Decision-To-Action Bridge expansion.
- Scheduler, WorkerLease, IntegrationCheck, parallel worker, apply/close, remote,
  PR, merge, or Harness evolution execution.
- Removing TaskQueue, WorkflowRun, WorkflowGraphPlan, or canonical workflow
  managers.
- Fully deleting the compatibility wrapper export.

## Current Status

Ready to close.

## Verification

Completed:

- `npx vitest run tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/workbench-module-boundaries.test.ts --testNamePattern "WorkflowGraph observation|routes main-agent orchestration|exports stable"`
- `npx vitest run tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/main-agent-step-loop.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

No manual UI acceptance is planned because this is an internal architecture
change with no Workbench surface changes.

- Manual config edits: none.
- Extra prompts or reviewer instructions: subagent review already advised keeping
  `runTaskQueueSequence` as a thin compatibility wrapper for this change.
- Retries or environment failures: initial `lint-ecl` failed until handoff docs
  pointed to the active change; fixed and re-run successfully.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded yet.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: current handoff only points to this active change;
  post-close it should point to the archived summary as latest product change.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: planned at close.
- Old experience retained / merged / retired / archive-only: legacy
  `runTaskQueueSequence` name remains compatibility-only for one window.
