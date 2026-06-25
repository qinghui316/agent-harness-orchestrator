# Plan: workbench-post-plan-scoped-automation-execution-v1

## Approach

Make the smallest policy and surface change that enforces post-plan automation:
remove `planning.confirm-execution` from the shared scoped automation allowlist
and from the frontend selector's local eligibility check. Keep all execution in
the existing automation runtime, which already re-reads the current
`confirmationQueue.primary`, validates target ids, dispatches through existing
handlers, and stops at unsupported or terminal gates.

Add server/revalidation coverage so a forged
`planning.automation.scoped-auto.run` request cannot target
`planning.confirm-execution` even if a stale UI sends it. Add DOM coverage so
the visible primary card shows only `请求批准` for plan confirmation, while
execution-stage gates still support `完全访问权限`.

## Steps

1. Update shared scoped automation policy and frontend eligibility.
2. Update runtime/revalidation/read-model/DOM tests to prove the plan gate is
   not automated and execution gates still are.
3. Run targeted and aggregate verification required for the touched Workbench
   action surface.
4. Close the active change, update handoff docs, and git-settle the completed
   change while excluding unrelated `README.md`.

## Decisions

- Planning generation and plan confirmation are human boundaries.
- Post-plan automation starts only after accepted planning artifacts exist and
  the current primary gate is an execution-stage gate.
- Raw scheduler, apply, close, integration apply/discard, remote, merge, and
  Harness evolution gates remain outside scoped automation.

## Minimality Gate Plan

- Can this be a no-op: no; current policy/UI already expose full-access for
  plan confirmation.
- Reuse: existing automation allowlist, scoped runtime runner, current-gate
  revalidation, confirmation queue, and DecisionPanels selector.
- Shared root fix: update shared policy and UI mirror rather than adding a
  one-off guard in one caller.
- Avoided: new runtime loop, permission system, action registry, evidence
  family, projection layer, or post-plan state machine.
- Smallest coherent change: remove the plan-confirm action from automation
  eligibility and add fail-closed tests.

## Module Boundary Plan

- Owner module: automation runtime policy, Workbench action revalidation, and
  DecisionPanels surface.
- New / moved responsibilities: none.
- Facade touch points: none beyond existing handler/revalidation dispatch.
- Forbidden write-back locations: broad Workbench manager/read-model facades
  should not receive new main logic.
- Compatibility surface: `planning.automation.scoped-auto.run` remains the
  same action; it becomes stricter for plan-confirm targets.
- Boundary tests: targeted runtime, action revalidation, read-model, and DOM.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation policy,
  target revalidation, confirmation queue, terminal human-gate checks.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed.
- Domain-specific logic location: automation eligibility and UI selector only.
- Shared cross-cutting logic location: shared automation policy.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: one shared eligibility boundary
  prevents UI/server/runtime drift.

## Planning-Discovered Gaps

The existing implementation already contains the gap this change fixes:
`planning.confirm-execution` is currently in the scoped automation allowlist
and in the frontend full-access selector.
