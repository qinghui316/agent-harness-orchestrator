# Auto Evolve Proposal: Phase 9Y-10D Goal Loop Evidence

## Window

Pending evolution window:

- Phase 9Y Scheduler End to End Workbench Acceptance
- Phase 9Z SchedulerRun Blocked Exhausted Closeout Gate
- Phase 10B Loop Engineering Codex Goal Reference Alignment
- Phase 10C Main Agent Goal Loop Decision Evidence Foundation
- Phase 10D Goal Loop Confirmation Surface

## Evaluation

This window crosses from scheduler terminal evidence into Goal-driven adaptive loop design:

- Phase 9Y/9Z proved scheduler terminal projection and blocked/exhausted closeout paths remain evidence-only and human-gated.
- Phase 10B documented Loop Engineering and Codex goal continuation as references, while preserving AHO Change/ECL and evidence gates as workflow truth.
- Phase 10C added non-executing `GoalLoopDecision` evidence with typed recommendations.
- Phase 10D surfaced `planning.goal-loop.evaluate` as a fallback Workbench confirmation without executing the recommended action.

The durable risk is not the current implementation, which is covered by tests and docs. The risk is future Goal Loop work accidentally treating `GoalLoopDecision.recommendedAction` as executable authority, or rendering Goal Loop evaluation as a competing primary confirmation that hides concrete planning, scheduler, IntegrationCheck, apply, close, landing, PR, or remote gates.

## Subagent Review

EvalMode: `subagent_review`

Subagent 1 recommended `noop` with score `92/100`. It found the existing Goal Loop Boundary sufficient and noted that `docs/WORKBENCH.md` and `AGENTS.md` already record the 10C/10D constraints.

Subagent 2 recommended `modify` with score `84/100`. It found product coverage strong but identified a review-template gap: future changes are not forced to check recommendation authority or fallback priority for Goal Loop confirmation surfaces.

The final decision accepts the minimal `modify` recommendation because it turns the concrete 10C/10D lesson into durable review coverage without adding product behavior or broad static heuristics.

## Recommendation

Status: `modify`

EvalMode: `subagent_review`

Apply the smallest Harness delta:

- Extend `docs/ECL.md` Goal Loop Boundary to state that `GoalLoopDecision.recommendedAction` is explanatory planning evidence only and must not be copied into fallback confirmation executable actions.
- Require Goal Loop confirmation-surface reviews to prove fallback priority: hide Goal Loop evaluation when concrete planning, scheduler, IntegrationCheck, apply, close, landing, PR, or remote confirmations exist.
- Add `Goal Loop Boundary Coverage` to the change review template with fields for persistent scope, recommendation authority, fallback priority, hidden execution/source mutation, ToolPolicyGate / human gate preservation, and tests.

No product code, runtime behavior, Workbench action, HTTP route, CLI command, UI/lazy projection, scheduler execution, child Change, source mutation, ODWF runtime, or cache/replay behavior should change.

## Validation

Required validation:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Product verification is not required because this is a docs/template Harness evolution. If scripts or product code are changed later, run the normal product gates.

## Limitations

- This review is based on archived evidence, current docs, and subagent review. It does not perform real manual UI acceptance.
- The new rule is intentionally review/template-based, not a fragile static heuristic.
- Future autonomous loop controller, scheduler loop, or parallel executor phases still require fresh product phases and gate-specific tests.
