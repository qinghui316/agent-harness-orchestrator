# Spec: main-agent-orchestration-step-loop-contract-v1

## Goal

Make the main-agent role orchestration runner structurally match the target
continuous orchestration shape without changing runtime authority or user
behavior. The runner should have an explicit internal contract for observing
current orchestration evidence, deciding the next deterministic role step,
running exactly one leaf role, and accepting the returned orchestration state.

## Users

- AHO maintainers extending main-agent orchestration toward future
  WorkflowPlan, TaskGraph, scheduler, and recovery integration.
- Existing Workbench/Harness users, who should see no UI or permission behavior
  change from this architecture-only migration.

## Acceptance Criteria

- AC-001: `src/main-agent-orchestration` contains an explicit step-loop owner
  whose contract separates observe, decide, run-one-leaf, and record-returned
  state responsibilities.
- AC-002: A leaf step runs at most one role and does not decide or launch the
  next role.
- AC-003: `runMainAgentOrchestration` preserves the current top-level behavior:
  coder, validator, auditor, and at most one automatic rework after validation
  or audit failure.
- AC-004: `runMainAgentTaskRunAttempt` remains a single attempt; retry remains
  owned by TaskRun / bounded-rework paths.
- AC-005: source-refresh and PR/feedback rework start at `rework-coder` but do
  not trigger a nested second automatic rework.
- AC-006: No Workbench UI, confirmation queue, workflow action registry,
  automation allowlist, apply/close, Scheduler, TaskQueue, WorkerLease,
  IntegrationCheck, remote, merge, PR, or Harness evolution authority changes.
- AC-007: Tests prove boundary separation, rework semantics, and existing
  successful/failure paths.

## Non-Goals

- Do not implement a free-form LLM main-agent decision policy.
- Do not introduce Open Dynamic Workflows as a dependency or runtime.
- Do not create new workflow truth, journal, recovery, TaskQueue, SchedulerRun,
  WorkerLease, or IntegrationCheck artifacts.
- Do not expose the step-loop contract in Workbench UI or confirmation cards.

## Constraints

- Leaf stages remain the owner for ToolPolicyGate, RoleDispatcher, AgentTask,
  code/validation/audit runs, worktree evidence, and boundary evidence.
- The new `record` step must not duplicate persistent evidence. It may only
  accept the `MainAgentOrchestrationState` returned by the leaf stage.
- Worker roles remain leaves and cannot recursively delegate, start scheduler
  waves, apply, merge, close, or evolve Harness rules.

## Risks

- Rework semantics could accidentally double-run if TaskRun attempts inherit the
  top-level automatic rework behavior.
- A new record layer could duplicate AgentTask/evidence writes already owned by
  leaf stages.
- Over-broad observation could accidentally make the new loop reason over
  Scheduler/IntegrationCheck state and look like a second runtime owner.

