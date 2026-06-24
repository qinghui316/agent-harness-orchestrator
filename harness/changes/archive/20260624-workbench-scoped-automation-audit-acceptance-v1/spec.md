# Spec: workbench-scoped-automation-audit-acceptance-v1

## Goal

Allow Workbench `完全访问权限` scoped automation to automatically accept a
current approved audit proposal after execution has reached `audit.run`, then
stop at the source-mutating `result.apply` human confirmation gate.

## Users

Developers using Workbench demand conversations who confirm a plan manually and
then choose `完全访问权限` for the execution segment. They expect local execution
to continue until the next decision that actually needs human judgment.

## Acceptance Criteria

- AC-001: Scoped automation supports a distinct approval-action child gate
  model without treating `audit.accept` as a `WorkflowActionType` or adding a
  parallel action registry.
- AC-002: `audit.accept` is eligible for automation only when the selected
  Change's authoritative `confirmationQueue.primary` is the same enabled
  `audit.accept` approval action.
- AC-003: Automatic `audit.accept` must verify matching `changeId`, audit id,
  run id, artifact scope, and audit status `approved`; `approved-with-notes`,
  `blocked`, missing, stale, forged, or cross-Change targets fail closed or
  stop automation.
- AC-004: After automatic audit acceptance, automation re-reads the Workbench
  snapshot and stops at `result.apply`; it never auto-applies source, closes,
  merges, pushes, lands remotely, or evolves Harness rules.
- AC-005: Workbench UI shows `完全访问权限` only for supported current gates,
  including safe `audit.accept`, and keeps it unavailable for apply, close,
  remote, merge, Harness evolution, and unsupported gates.
- AC-006: Real UI acceptance in an external sandbox proves one full-access
  execution segment can pass through code/validation/audit/audit.accept and
  stop at a real apply gate without source-root mutation before apply.

## Non-Goals

- Do not auto-run `planning.generate`; plan generation and plan confirmation
  remain manual boundaries.
- Do not auto-apply source changes, close/archive Changes, merge, push, remote
  land, or apply Harness evolution.
- Do not implement full-auto task mode, a scheduler loop, a parallel executor,
  slot allocation, or child Change creation.
- Do not promote Goal Loop evidence, UI state, or Codex session state into an
  authority source.

## Constraints

- Reuse `src/automation-runtime/`, existing Workbench approval actions,
  confirmation queue projection, current-gate revalidation patterns, ToolPolicy
  / human gate boundaries, and validation/audit artifacts.
- Add only the minimum shared type/policy extension needed to represent
  workflow-action and approval-action child gates.
- Keep `README.md` unrelated and untracked.

## Risks

- If approval actions are routed around current-primary revalidation,
  automation could consume stale or forged audit gates.
- If UI exposes `完全访问权限` on apply/close gates, users may infer source
  mutation authority that this change explicitly does not grant.
- If `approved-with-notes` is auto-accepted, automation may hide a human
  judgment point; V1 therefore accepts only plain `approved`.
