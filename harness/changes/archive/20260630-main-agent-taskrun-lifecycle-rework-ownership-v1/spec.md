# Spec: main-agent-taskrun-lifecycle-rework-ownership-v1

## Goal

TaskRun bounded rework should be controlled by the main-agent orchestration owner, not by workflow-runtime wrappers. The runtime should still behave as before, but the control structure should match the target main-agent loop:

`observe TaskRun attempt result -> decide whether rework is legal -> run one bounded rework leaf -> record result -> stop at existing Harness gate`.

## Users

- AHO maintainers migrating fixed runtime pipelines into the main-agent continuous orchestration architecture.
- Future agents implementing queue-level orchestration, WorkflowGraph integration, and scheduler integration on top of the main-agent loop.

## Acceptance Criteria

- AC-001: `runMainAgentTaskRunAttempt` remains a single-attempt entrypoint and does not perform bounded retry internally.
- AC-002: A new main-agent TaskRun lifecycle entrypoint runs initial attempt, finishes the TaskRun, observes result evidence, and runs at most one `rework-coder` retry only for validation/audit failure with remaining budget.
- AC-003: TaskQueue item execution uses the new lifecycle, and if rework creates a retry TaskRun the current queue item is rebound before rework coder execution so `taskqueue-proposal` gate scope remains valid.
- AC-004: Stage-resume paths continue to support completed, continue-validation, continue-audit, and blocked verdicts without defaulting back to coder; resumed validation/audit failure returns to main-agent lifecycle for rework decision.
- AC-005: `task-run-sequence.ts` and `stage-resume-runner.ts` no longer directly execute bounded rework recursion.
- AC-006: No Workbench UI, confirmation queue, workflow action registry, revalidation, automation allowlist, scheduler, apply/close, remote, PR, merge, or Harness evolution authority changes are introduced.

## Non-Goals

- Do not implement free-form LLM main-agent decisions.
- Do not migrate the whole TaskQueue while-loop into main-agent orchestration.
- Do not connect parallel scheduler, WorkerLease wave dispatch, or IntegrationCheck.
- Do not change user-visible Workbench surfaces or transcript content.

## Constraints

- `task-run/manager` remains the TaskRun lifecycle owner for start, retry, mark-started, and finish.
- `task-queue` remains the queue item owner.
- `workflow-run` remains the WorkflowRun sync and recovery journal owner.
- `main-agent-orchestration` owns only role orchestration and bounded rework decision control.
- Code failure, boundary violation, scope mismatch, and gate failure must not trigger automatic rework.

## Risks

- Rebinding a TaskQueue item to the retry TaskRun too late would break `taskqueue-proposal` execution gate scope checks.
- Collapsing stage-resume into normal coder-first execution would lose recovery behavior and rerun work unnecessarily.
- Finishing the main-agent loop after the initial failed attempt would split initial/rework evidence and break loop continuity.
- Moving too much TaskQueue logic into main-agent orchestration would create a second queue runtime.
