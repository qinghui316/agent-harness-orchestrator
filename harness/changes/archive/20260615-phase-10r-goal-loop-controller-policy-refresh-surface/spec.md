# Spec: Phase 10R Goal Loop Controller Policy Refresh Surface

## Goal

Make `GoalLoopControllerPolicy` usable in the normal Workbench flow without turning it into an executor. When the latest Goal Loop packet already matches the current concrete Harness gate, the user may refresh controller policy evidence from that visible gate. The artifact records whether the main Agent should recommend the existing gate, suppress stale guidance, wait, or report blocked state.

## Users

- Developer using AHO Workbench on a long-running Change.
- Main Agent reading Goal Loop evidence before explaining the next Harness gate.
- Future agents auditing why a concrete gate was recommended or suppressed.

## Acceptance Criteria

- AC-001: Phase 10Q is recorded as closed and Phase 10R as active while the change is open.
- AC-002: A new scoped Workbench action refreshes `GoalLoopControllerPolicy` from the latest packet plus a current visible gate snapshot.
- AC-003: The refresh action is attached only as a secondary action on a matching concrete Harness gate; it must not become a primary queue item or fallback executable action.
- AC-004: Refresh requires `changeId` and `goalLoopNextStepPacketId` and preserves current gate scope in action payload, decision/audit scope, and stale-target revalidation.
- AC-005: Stale, forged, cross-Change, mismatched packet/gate, or missing current-gate scope fails closed.
- AC-006: Refresh writes only Goal Loop controller policy evidence, assistant/thread/live evidence, and Workbench decision/audit records.
- AC-007: Refresh does not start scheduler/runtime work, workers, validation, audit, IntegrationCheck, apply/close, landing/PR/merge, child Changes, runs, worktrees, leases, or source mutation.
- AC-008: Read-model projection remains read-only and displays the latest valid controller verdict after refresh.
- AC-009: Main policy logic stays in `src/goal-loop`; Workbench/server/frontend layers remain thin dispatch, revalidation, and display surfaces.
- AC-010: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- Do not add a new autonomous controller or loop scheduler.
- Do not execute a recommended action from controller policy.
- Do not parse ordinary chat text as controller feedback.
- Do not replace concrete Harness gates, ToolPolicyGate, stale-target revalidation, or human confirmation.
- Do not copy Codex goal runtime or Loop Engineering unattended execution.

## Constraints

- `GoalLoopControllerPolicy.authority` remains `non-executing-controller-policy-evidence`.
- The existing concrete Workbench gate remains the only executable transition.
- Projection code must not write artifacts.
- `README.md` remains unrelated and untracked.

## Risks

- Risk: controller refresh could be mistaken for action execution. Mitigation: secondary action wording, fixed `executionStarted=false`, explicit result text, and no calls to concrete action handlers.
- Risk: Workbench or server code could start owning policy decisions. Mitigation: keep policy compilation in `src/goal-loop/controller.ts`; server/action layers only pass current gate snapshots and verify scope.
- Risk: stale packet guidance could be refreshed against the wrong gate. Mitigation: require packet id and current gate scope, then fail closed on mismatch.
