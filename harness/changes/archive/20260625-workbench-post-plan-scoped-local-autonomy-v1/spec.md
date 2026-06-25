# Spec: workbench-post-plan-scoped-local-autonomy-v1

## Goal

After a user manually accepts a plan and selects `full access`, Workbench should
allow AHO to autonomously finish the current Change's local loop:
implementation, validation, audit, bounded recovery, safe audit acceptance,
local result apply, and local close/archive. The same authorization must not
cover plan confirmation, remote operations, integration apply/discard, Harness
evolution, or any unscoped/stale/cross-change action.

## Users

- Users running Workbench demand conversations who want the local execution
  loop to continue without repeated confirmations after they have approved the
  plan.
- Agents maintaining AHO who need the full-access boundary to be explicit,
  testable, and reuse existing apply/close safety rather than becoming a new
  permission framework.

## Acceptance Criteria

- AC-001: `planning.confirm-execution` remains human-only; `full access` is not
  offered or consumed before accepted plan artifacts exist.
- AC-002: Post-plan scoped full-access authorization is bound to the selected
  `projectId`, `changeId`, accepted artifact hashes, source state, current
  target ids, and permission profile.
- AC-003: Scoped automation may consume existing local execution/recovery gates
  and safe `audit.accept` as before.
- AC-004: Scoped automation may consume local `result.apply` only through the
  existing apply handler and source-safety guards.
- AC-005: Scoped automation may consume local `change.close` only through the
  existing close handler and current-gate revalidation for the same Change.
- AC-006: Automation stops fail-closed on stale, missing, forged, cross-change,
  source dirty/drift, artifact drift, unsupported, remote, integration
  apply/discard, Harness evolution, scope expansion, requirement clarification,
  or product tradeoff gates.
- AC-007: Workbench UI still exposes only `request approval` and `full access`;
  running automation hides duplicate primary confirmations and does not
  advertise future full-auto, parallel executor, merge queue, or Harness
  evolution automation.
- AC-008: Real E-drive UI acceptance proves a small ordinary demand can go from
  human plan confirmation through automatic local apply and close, with before
  and after source-state evidence.

## Non-Goals

- No automatic plan confirmation.
- No remote push, merge, PR, remote landing, or Harness evolution.
- No direct raw scheduler action automation.
- No integration apply/discard automation.
- No new workflow runtime, permission system, projection system, evidence
  family, child Change creation, slot allocator, or parallel executor.

## Constraints

- Reuse the existing automation runtime, Workbench action handlers,
  current-gate revalidation, apply/close handlers, and source-safety checks.
- Do not treat Goal Loop evidence, UI state, or Codex session state as
  authorization.
- Keep `README.md` unrelated and untracked.
- Product-code changes must include source apply safety, Workbench user-surface
  honesty, scoped payload, runtime bridge, module boundary, and core reuse
  review coverage.

## Risks

- Widening full access past `result.apply` could mutate source without adequate
  scope checks if existing apply safety is bypassed.
- Automatically closing could archive a Change whose final gate is stale or no
  longer selected if close target revalidation is weak.
- Mixing Harness evolution into this runtime would blur self-modification
  authority; this change explicitly keeps that out of scope.

