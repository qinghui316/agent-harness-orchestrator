# workbench-goal-loop-decision-surface-audit-v1

## Purpose

Audit and, only if needed, minimally align the existing Goal Loop decision
surface in Workbench. The existing chain is `GoalLoopDecision ->
GoalLoopNextStepPacket -> ControllerPolicy -> GateReadinessPreflight ->
confirmationQueue`; this change must not add a second next-step decision engine.

The first concrete issue is handoff drift: current handoff docs still name the
completed planning/decomposition scope honesty work as the next product-sized
blocker. This change updates that direction to the Goal Loop decision surface
audit and records whether the existing surface is already correct.

## Scope

In scope:

- Audit Workbench Goal Loop guidance against the authoritative current gate.
- Fix stale next-step wording in `docs/STATUS.md` and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Add targeted evidence for scheduler guidance, stale/mismatch suppression,
  ordinary sequential paths, bounded rework wording, IntegrationCheck wording,
  and scoped automation boundaries.
- Apply minimal projection/copy/action-scope fixes only if the audit finds a
  real gap.

Out of scope:

- New decision engine, runtime, state machine, evidence family, permission
  system, scheduler executor, or projection framework.
- Direct `完全访问权限` consumption of raw `planning.scheduler.*` actions.
- Automatic apply, close, merge, remote landing, Harness evolution, child
  Change creation, slot allocation, or full parallel execution.

## Current Status

Ready to close.

## Verification

- Targeted audit:
  `npx vitest run tests/unit/goal-loop-decision.test.ts tests/unit/controlled-scheduler-post-step-projection.test.ts tests/unit/automation-runtime.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
  passed: 5 files, 174 tests.
- Drift grep passed: no current handoff text still names planning/decomposition
  scope honesty as the next product blocker.
- No product code changed; no real UI acceptance required for this no-code audit
  and handoff alignment.
- Harness checks passed: `lint-ecl`, `lint-encoding`,
  `harness-change reindex`, `harness-change status`, and
  `harness-evolve check`.

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

- Documentation entropy check: applicable because handoff docs are updated.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: passed for active path and old
  scope-honesty next-step wording.
- Old experience retained / merged / retired / archive-only: scope-honesty
  history remains archive/current-baseline only; next-step wording moved to this
  audit.
