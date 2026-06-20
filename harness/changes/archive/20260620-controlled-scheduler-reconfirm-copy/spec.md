# Spec: controlled-scheduler-reconfirm-copy

## Goal

Users should understand that a repeated-looking controlled scheduler
continuation button is still a fresh, human-confirmed, single-step decision.
If the current Workbench read model has fresh Goal Loop/controller/preflight
evidence for the visible scheduler gate, the right confirmation card should say
the current next-step judgment and step check are refreshed, and that confirming
continues only one step rather than starting an automatic loop.

## Users

- Developers using the Workbench right confirmation queue to advance a
  controlled scheduler run one legal step at a time.
- Future agents reviewing controlled scheduler behavior and user-facing gate
  honesty.

## Acceptance Criteria

- AC-001: The controlled scheduler advance projection can select refreshed
  reconfirmation copy when current Workpad Goal Loop evidence has a matching
  controller verdict and gate-readiness preflight for the current scheduler
  gate.
- AC-002: The projected confirmation item still exposes exactly one
  `planning.scheduler.controlled-advance.run` primary workflow action for the
  scheduler source gate and strips stale Goal Loop evidence ids from that
  action.
- AC-003: The refreshed copy does not claim that a previous step stopped unless
  there is explicit post-step handoff evidence available in the current
  projection. This change may use the safer copy that only claims refreshed
  current judgment and a new single-step confirmation.
- AC-004: A real web DOM test renders the right confirmation card and asserts
  that the user can see the refreshed/new-single-step/non-auto-loop wording on
  the actual decision surface.
- AC-005: The change does not add scheduler runtime authority, new workflow
  truth, new state model, new action type, new route, new schema, or new
  artifact writer.

## Non-Goals

- Implementing a scheduler loop, full parallel executor, slot allocator, or
  whole-wave dispatch.
- Reading historical decision payloads as a new truth source.
- Moving execution, ToolPolicy, stale revalidation, IntegrationCheck, apply,
  close, remote landing, or Harness evolution gates.
- Changing Workbench main transcript rendering.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation,
  Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- The existing controlled scheduler advance handler remains the only execution
  path for `planning.scheduler.controlled-advance.run` and still revalidates
  fresh Goal Loop/controller/preflight evidence before executing one concrete
  scheduler transition.
- Primary Workbench copy must avoid raw internal terms unless already part of
  developer/evidence context.
- Product-code changes must follow Architecture Growth Control / Core
  Mechanism Reuse by extending existing owner modules rather than creating a
  feature-local state machine or projection system.

## Risks

- Over-claiming history would mislead the user into thinking AHO proved a
  previous controlled step stopped. The implementation must only claim what the
  current projection evidence proves.
- Adding another action or fallback execution surface would weaken the human
  gate boundary. This change must keep the single existing controlled-advance
  action.
