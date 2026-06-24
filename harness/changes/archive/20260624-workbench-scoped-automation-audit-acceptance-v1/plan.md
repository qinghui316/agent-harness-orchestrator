# Plan: workbench-scoped-automation-audit-acceptance-v1

## Approach

Extend the existing scoped automation runner rather than adding a new
automation or permission system. Model child gates as either workflow actions
or approval actions, with V1 allowing only the existing `audit.accept` approval
action. Keep `result.apply` and all other high-impact approvals terminal.

## Steps

1. Update automation runtime types/policy so authorization records can list
   allowed workflow action types plus allowed approval action ids, and
   iterations can record either submitted workflow action type or approval
   action id.
2. Add reusable current-primary approval gate validation for automation. It
   must compare the requested approval action to the latest Workbench
   `confirmationQueue.primary` and then verify the audit artifact belongs to
   the selected Change with status `approved`.
3. Add a child approval dispatcher in the automation handler that calls the
   existing approval action path for `audit.accept` only, records automation
   audit scope, and reuses existing decision recording semantics.
4. Update Workbench UI action construction so full-access can wrap a supported
   approval action only for safe `audit.accept`, while apply/close/remote/
   Harness evolution remain manual.
5. Add bounded unit/DOM coverage before running aggregate checks and real UI
   acceptance in an external sandbox.

## Decisions

- `planning.generate` stays outside scoped automation.
- `audit.accept` is treated as local evidence materialization, not source
  mutation.
- `approved-with-notes` remains a human decision in V1.
- Apply, close, merge, remote landing, and Harness evolution are terminal
  human gates.
- No new registry, projection system, permission system, or evidence family.

## Module Boundary Plan

- Owner module: extend `src/automation-runtime/` for automation gate policy and
  runtime records.
- New / moved responsibilities: add approval-gate support to the existing
  automation handler and current-gate revalidation owner.
- Facade touch points: Workbench server/action facades may forward existing
  fields only; they must not own automation policy.
- Forbidden write-back locations: do not add main logic to broad facades such
  as `src/workbench/chat.ts`, `src/workbench/manager.ts`,
  `src/workbench/projections/read-model/implementation.ts`, or `src/web/src/App.tsx`.
- Compatibility surface: no public route rename and no approval action id
  rename.
- Boundary tests: automation runtime, current-gate revalidation, read-model,
  and DOM tests.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: scoped automation runtime,
  Workbench approval actions, confirmation queue primary, current-gate
  revalidation, validation/audit artifacts, and human apply/close gates.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed; only a small child-gate union is added.
- Domain-specific logic location: audit status eligibility stays in the
  automation/approval validation path.
- Shared cross-cutting logic location: child-gate policy and stop rules remain
  in `src/automation-runtime/`.
- Local framework / state machine / projection / validation / gate avoided: no
  parallel permission system, registry, or projection is introduced.
- Future-cost reduction for similar features: future safe approval gates can
  reuse the same current-primary approval revalidation instead of creating
  gate-specific shortcuts.

## Planning-Discovered Gaps

- Existing automation types only accept `WorkflowActionType`, so the
  implementation must introduce a narrow gate union rather than forcing
  `audit.accept` into workflow action types.
- Existing server approval route allowlists approval ids but does not provide
  automation-grade current-primary approval revalidation; this change must add
  that guard before dispatching child approval actions.
