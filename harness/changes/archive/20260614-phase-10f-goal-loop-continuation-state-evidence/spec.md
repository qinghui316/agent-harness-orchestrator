# Spec: Phase 10F Goal Loop Continuation State Evidence

## Goal

Add evidence-only continuation state to `GoalLoopIteration` so a selected
Change's Goal Loop journal records not only the current decision but also the
control constraints for the next pass.

The state must be derived from current evidence and must not become a new source
of workflow truth. AHO still treats Change/ECL, accepted artifacts,
Run/Validation/Audit/IntegrationCheck evidence, and Apply/Close human gates as
authoritative.

## Users

- Main Agent: needs a durable current-state summary before deciding whether to
  wait, recommend an existing gate, or explain blocked/close readiness.
- User: needs the conversation to remain simple and not expose internal loop
  mechanics as executable buttons.
- Future maintainers: need a scoped, testable boundary that prevents Goal Loop
  evidence from turning into an implicit scheduler or close controller.

## Acceptance Criteria

- AC-001: Phase 10E is recorded as archived and Phase 10F as active in
  `AGENTS.md` and `docs/STATUS.md`, with no stale Phase 10E active claim.
- AC-002: `GoalLoopIteration` records continuation state, control policy,
  budget/accounting signal, resume preconditions, and optional suppression
  reason as evidence-only fields.
- AC-003: Continuation state is derived from the current `GoalLoopDecision` and
  remains `executionStarted=false`.
- AC-004: The new fields do not introduce a new Workbench action, CLI command,
  route, frontend surface, scheduler loop, worker start, IntegrationCheck,
  apply, close, source mutation, or child Change.
- AC-005: `planning.goal-loop.evaluate` remains the only entrypoint and still
  writes evidence only.
- AC-006: `recommendedAction` remains a snapshot of an existing gated action and
  is not converted into an executable fallback action.
- AC-007: Goal Loop owner logic remains in `src/goal-loop/*`; Workbench handler
  remains thin and no Goal Loop module imports Workbench, server, web UI, CLI,
  or worker-start implementations.
- AC-008: Existing GoalLoopDecision / GoalLoopIteration artifact paths remain
  compatible; schema changes are additive.
- AC-009: Focused tests cover state mapping, no execution side effects,
  Workbench fallback behavior, workflow action scope, and module boundaries.
- AC-010: Harness and product verification pass, or pre-existing full-test
  timeout is recorded.

## Non-Goals

- Implementing a Goal Loop Controller.
- Copying Codex `GoalRuntimeState`, continuation lock, idle turn start, or token
  accounting authority.
- Adding a separate canonical `GoalLoopState` artifact in this phase.
- Making Goal Loop state a workflow truth or completion authority.
- Starting scheduler/worker/runtime/apply/close behavior.
- Adding UI beyond existing evidence text and action result summaries.

## Constraints

- The state is derived evidence only; it must not modify Change, SchedulerRun,
  TaskRun, Workbench nextAction, or close status.
- Budget/accounting signal must be conservative. If AHO has no canonical budget
  source, record `unknown` rather than fabricating token/time usage.
- `ready-for-human-close-gate` may explain close readiness but must not close the
  Change.
- Fallback priority remains unchanged: concrete confirmations suppress Goal Loop
  evaluation.
- `README.md` remains unrelated and untracked.

## Risks

- Naming risk: "state" or "control" could be misread as controller authority.
  Mitigation: document and render it as evidence-only control constraints.
- Budget risk: Codex has true runtime accounting, AHO does not. Mitigation:
  record unknown/declared signal only.
- Surface risk: users could see Goal Loop as a second action path. Mitigation:
  no new action and no executable recommendedAction.
