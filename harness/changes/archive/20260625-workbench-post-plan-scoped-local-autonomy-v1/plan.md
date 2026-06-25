# Plan: workbench-post-plan-scoped-local-autonomy-v1

## Approach

Use the existing `automation-runtime` as the only loop owner. Widen its allowed
local terminal gates to include `result.apply` and `change.close`, but route
both through the same Workbench current-gate revalidation and existing handlers
used by manual confirmation. Do not introduce a separate automation authority.

## Steps

1. Inspect the automation policy, runner, Workbench action handler, current-gate
   revalidation, apply handler, close handler, read-model, and DOM surfaces.
2. Add the smallest policy/runtime change that permits local apply and close
   only when the current primary gate is enabled, scoped, and revalidated.
3. Preserve explicit stop behavior for remote, integration apply/discard,
   Harness evolution, raw scheduler, and unsupported gates.
4. Extend targeted tests for apply/close success and fail-closed cases.
5. Run required verification and perform E-drive real UI acceptance.
6. Update summary/review/handoff, close the change, and git-settle the result.

## Decisions

- Product runtime and Harness evolution policy stay separate. This change
  widens local Workbench automation only.
- `result.apply` and `change.close` become local full-access gates only after
  human plan confirmation and existing safety evidence.
- Integration apply/discard remains manual because it is a separate aggregate
  decision surface.

## Minimality Gate Plan

- Can this be a no-op: no; current product intentionally stops at
  `result.apply`.
- Reuse: existing automation runtime, current-gate revalidation, ToolPolicy /
  source safety, apply/close handlers, confirmation queue, and DecisionPanels
  eligibility.
- Shared root fix: inspect automation policy/runner plus Workbench action
  handler/revalidation so manual and automated paths share checks.
- Avoided: no new permission system, workflow runtime, scheduler executor,
  projection framework, evidence family, or local apply path.
- Smallest coherent change: widen the existing allowed local gate policy and
  reuse existing handler execution/revalidation.

## Module Boundary Plan

- Owner module: `src/automation-runtime/` for loop policy/run recording;
  existing Workbench action handlers own actual apply/close behavior.
- New / moved responsibilities: no new owner; automation may classify local
  apply/close as allowed current gates.
- Facade touch points: existing Workbench action service/server dispatch only.
- Forbidden write-back locations: do not place main logic into broad Workbench
  facade/server files or add gate-specific private validators.
- Compatibility surface: manual approval behavior remains valid; server action
  contracts remain explicit target-id based.
- Boundary tests: automation runtime, action revalidation, apply/close, read
  model, and DOM tests.
- Follow-up split candidates: none.
- If not applicable, reason: module boundary review is applicable and recorded
  in `reviews/review.md`.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: automation runtime,
  confirmationQueue.primary, current-action revalidation, source apply safety,
  close gate, ToolPolicy evidence, accepted artifact/source drift checks.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: apply/close semantics stay in existing
  handlers; automation only decides whether the current gate is eligible.
- Shared cross-cutting logic location: stale-target/source/artifact checks stay
  in existing shared safety/revalidation owners.
- Local framework / state machine / projection / validation / gate avoided:
  avoid a second full-access state machine and feature-local safety gate.
- Future-cost reduction for similar features: future local terminal gates can
  use the same current-gate eligibility pattern rather than copying checks.

## Planning-Discovered Gaps

None yet.

