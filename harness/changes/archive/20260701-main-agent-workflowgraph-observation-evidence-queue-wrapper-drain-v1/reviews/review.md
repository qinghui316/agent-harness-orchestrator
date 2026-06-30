# Review: main-agent-workflowgraph-observation-evidence-queue-wrapper-drain-v1

## Result

Approved for close.

## Findings

No blocking issues found.

## Coverage Review

- AC-001/AC-002: `src/main-agent-orchestration/workflowgraph-observation.ts`
  defines the graph-level observation and writes
  `workflowgraph-decisions.jsonl` with explicit non-executing authority and
  stage-level decision kinds.
- AC-003: Graph evidence omits queue-item decision details; queue item
  decisions remain in `queue-step-evidence.ts`.
- AC-004: Planning artifact handlers and TaskQueue lifecycle record graph
  observation evidence without changing action return shapes or queue execution.
- AC-005: Workbench production handlers call
  `runMainAgentTaskQueueLifecycle`; `runTaskQueueSequence` remains only as a
  thin compatibility wrapper.
- AC-006: No UI, confirmation queue, action registry, scheduler, terminal,
  apply/close, remote, PR, merge, or Harness evolution authority was added.

## Boundary Review

- The new owner imports workflow artifact, WorkflowRun, recovery key, TaskQueue
  types, and agent-task path helpers only.
- It does not import Workbench UI, Workbench action handlers, scheduler runtime,
  workflow action registry, terminal, apply/close, or automation allowlist.
- It records evidence as bounded summaries and refs. It does not duplicate
  WorkflowRun events or queue-step item selection.
- Existing TaskQueue, WorkflowRun, WorkflowGraphPlan, recovery key, validation,
  and audit owners remain canonical.

## Verification Evidence

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

## Residual Risk

The compatibility wrapper export still exists intentionally. Final removal
should be a later cleanup after downstream compatibility is proven and the
import graph stays clean.
