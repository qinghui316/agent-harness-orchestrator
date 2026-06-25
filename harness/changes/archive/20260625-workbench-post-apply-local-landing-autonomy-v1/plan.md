# Plan: workbench-post-apply-local-landing-autonomy-v1

## Approach

Make the smallest owner-local change: extend the existing scoped automation
policy to include `landing.prepare`, mark the existing landing confirmation
queue item as automation-eligible, and prove current-gate revalidation already
enforces the same `changeId` plus target-id scope. Add targeted tests for the
post-apply landing/close path and for disallowed remote/high-impact gates.

## Steps

1. Inspect existing automation, landing, current-gate revalidation, and
   Workbench projection tests.
2. Add `landing.prepare` to the local scoped automation workflow allowlist.
3. Mark the existing local landing confirmation queue item as eligible for
   scoped automation.
4. Add targeted tests for allowlist, revalidation, projection/DOM eligibility,
   stop boundaries, and source-safety/non-mutation expectations.
5. Run targeted product verification and required checks.
6. Record acceptance evidence, update handoff docs, close/archive, and git
   settle excluding unrelated `README.md`.

## Decisions

- `landing.prepare` is a workflow action, not an approval action, because the
  existing handler already owns `prepareLandingPackage` and
  `reviewLandingPackage`.
- Remote, PR, merge, post-merge, integration apply/discard, and Harness
  evolution remain outside full-access automation because they cross local
  evidence/readiness or high-impact boundaries.
- Confirmation-point feedback-to-rework is intentionally deferred because it
  needs its own feedback lineage and revise/rework semantics.

## Minimality Gate Plan

- Can this be a no-op: no; current accepted local autonomy stops at unsupported
  `landing.prepare`, leaving a real post-apply local landing gap.
- Reuse: use `automation-runtime`, `current-action-revalidation`, existing
  landing handler, confirmation queue, and DecisionPanels.
- Shared root fix: check policy allowlist, revalidation, projection, and DOM
  callers before adding local guards.
- Avoided: no new automation runtime, permission system, landing executor,
  projection system, or feedback framework.
- Smallest coherent change: allowlist + projection eligibility + targeted tests
  and handoff.

## Module Boundary Plan

- Owner module: `src/automation-runtime/` for allowed-gate and stop policy;
  `src/workbench/projections/read-model/confirmation/landing.ts` for landing
  confirmation projection; existing Workbench action handler for landing
  execution.
- New / moved responsibilities: none; only extend current owner data/flags.
- Facade touch points: action dispatch remains through existing handler map.
- Forbidden write-back locations: no main logic in `chat.ts`, `manager.ts`,
  `read-model.ts`, `workbench-server.ts`, or `App.tsx`.
- Compatibility surface: no route/action id or artifact schema change.
- Boundary tests: automation runtime, current-action revalidation,
  workflow-action required targets, read-model, and DOM tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation policy,
  current-gate revalidation, required target validation, landing handler,
  confirmation queue, and source safety guards.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  no new mechanism is proposed.
- Domain-specific logic location: landing projection stays in landing
  confirmation builder; landing execution stays in remote-handoff/landing
  handler owner.
- Shared cross-cutting logic location: current-gate revalidation remains the
  shared stale/forged/cross-change guard.
- Local framework / state machine / projection / validation / gate avoided:
  avoided all new local systems.
- Future-cost reduction for similar features: future local gates can be added
  through the same allowlist/projection/revalidation path rather than bespoke
  automation branches.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Later product slice needed:
  `workbench-confirmation-feedback-to-rework-v1` for user modification feedback
  at confirmation points.
