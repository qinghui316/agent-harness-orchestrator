# Plan: controlled-scheduler-reconfirm-copy

## Approach

Extend the existing controlled scheduler advance confirmation projection to
choose a safer refreshed-confirmation copy when current Workpad Goal Loop
evidence proves the visible scheduler gate has a matching controller verdict
and gate-readiness preflight. The copy will say that current next-step judgment
and step checks are refreshed, and that the user is confirming a new single
step rather than authorizing automatic continuation.

The implementation will not infer historical execution from decision payloads.
If post-step handoff evidence is not available in the current confirmation
projection, the copy will avoid saying "the previous step stopped."

## Steps

1. Add or expose a scheduler user-facing copy variant for refreshed controlled
   scheduler reconfirmation.
2. Pass the current Workpad into `attachControlledSchedulerAdvanceActions` from
   the confirmation queue builder.
3. In the confirmation projection owner, select the refreshed copy only when
   current Goal Loop evidence matches the current scheduler source gate and has
   `controllerVerdict = recommend-existing-gate`,
   `controllerGateStatus = matches-current-gate`, and a
   `gateReadinessPreflightId`.
4. Preserve the existing controlled-advance action transformation, target ids,
   action de-duplication, and stale Goal Loop id stripping.
5. Add projection tests for copy selection and action invariants.
6. Add real web DOM coverage for the right confirmation card text.

## Decisions

- Use safer refreshed-copy wording instead of post-step historical wording
  because the current projection does not have a canonical post-step handoff
  source.
- Do not read `WorkbenchDecision` payloads or completed action history as
  workflow truth.
- Do not create new workflow actions, routes, schemas, stores, or artifact
  writers.

## Module Boundary Plan

- Owner module: `src/workbench/projections/read-model/confirmation/goal-loop.ts`
  owns controlled scheduler advance confirmation projection and copy selection.
  `src/workbench/projections/read-model/confirmation/scheduler-user-surface.ts`
  owns scheduler user-facing copy.
- New / moved responsibilities: no new responsibility family; refine existing
  projection copy selection.
- Facade touch points: `confirmation-queue.ts` may pass the existing Workpad
  into the owner helper.
- Forbidden write-back locations: no main logic in Workbench chat/server
  facades, frontend shell, `src/types/index.ts`, manager facades, or workflow
  runtime facades.
- Compatibility surface: confirmation queue item shape and action payload shape
  remain compatible.
- Boundary tests: projection unit tests plus web DOM test of the right
  confirmation card.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench confirmation queue,
  scheduler user-facing copy helpers, Goal Loop matching metadata, gate
  readiness preflight evidence, and controlled scheduler advance action
  transformation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: controlled scheduler advance copy selection
  remains in the confirmation projection owner.
- Shared cross-cutting logic location: existing copy helper and action
  transformation stay shared for scheduler confirmation surfaces.
- Local framework / state machine / projection / validation / gate avoided: no
  decision-payload history model, no local scheduler state machine, no new
  validation gate, no duplicate action path.
- Future-cost reduction for similar features: future confirmation surfaces can
  reuse the same pattern of selecting copy from current evidence without
  adding execution authority.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review found that unconditional "previous step stopped" wording
  would overclaim unless post-step handoff evidence is available in the current
  projection. This plan uses safer refreshed-current-evidence wording instead.
