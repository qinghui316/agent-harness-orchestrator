# Spec: document-goal-driven-workflow-loop-target

## Goal

Make the future AHO architecture legible to later agents: the target is a
Goal-driven Workflow Loop where the main Agent owns evidence-aware next-step
selection around a persistent Goal/Change. WorkflowGraph/WorkflowRun provide
typed execution structure and recovery boundaries; Scheduler/worktree execution
is one strategy for low-conflict write-capable slices; ToolPolicyGate and human
gates still own high-impact transitions.

## Users

- Future coding agents and reviewers reading current roadmap docs before
  proposing the next product slice.
- The product owner evaluating whether the current architecture is becoming
  over-abstracted or still moving toward a usable loop.

## Acceptance Criteria

- AC-001: `docs/CURRENT-DEVELOPMENT-PLAN.md` states the positive
  Goal-driven Workflow Loop target, including user responsibilities, main-Agent
  responsibilities, workflow responsibilities, scheduler responsibilities, and
  worktree suitability boundaries.
- AC-002: `docs/PRODUCT.md` explains the final user experience as a
  goal-driven development conversation, not an internal TaskGraph/Scheduler
  control surface, and keeps full-auto as future scoped authorization only.
- AC-003: `docs/AGENT-DEVELOPMENT-OS.md` explains how Codex Goal, Loop
  Engineering, Open Dynamic Workflows, and Symphony combine in AHO.
- AC-004: `docs/WORKBENCH.md` says the Workbench should show current goal,
  evidence, and one safe next action while hiding raw TaskRun/WorkerLease/
  SchedulerRun internals from primary workflow.
- AC-005: `docs/design-docs/controlled-scheduler-loop.md` is positioned as a
  Scheduler loop boundary, not the complete Goal-driven Workflow Loop
  architecture.
- AC-006: Handoff docs and active change records avoid stale claims that a full
  autonomous workflow loop, full parallel executor, or full-auto task mode is
  current implemented behavior.

## Non-Goals

- No runtime/product code changes.
- No full-auto task mode implementation.
- No Scheduler loop, slot allocator, child Change auto-creation, or whole-wave
  dispatch implementation.
- No new Harness evolution.
- No reference submodule updates.

## Constraints

- Current workflow truth remains Change/ECL, accepted artifacts, run artifacts,
  validation/audit, worktree state, apply/close decisions, and Harness
  evolution records.
- Goal Loop and Scheduler documents must not promote evidence/projection layers
  into execution authority.
- Current docs must stay compact; historical phase details stay archive-only.
- Handoff docs may be updated only for current active/close pointers and
  next-step clarity.

## Risks

- Over-correcting the docs into a new abstract layer without changing later
  agent decisions.
- Leaving older straight-line TaskGraph/worktree wording that future agents may
  treat as the complete architecture.
- Making full-auto or parallel executor language sound implemented when it is
  still future-only.
