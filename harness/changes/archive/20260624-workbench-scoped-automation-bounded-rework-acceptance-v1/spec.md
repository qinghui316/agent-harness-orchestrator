# Spec: workbench-scoped-automation-bounded-rework-acceptance-v1

## Goal

Prove that Workbench `完全访问权限` can automatically consume existing bounded
failure-recovery gates when, and only when, those gates are the selected
demand's current authoritative primary confirmation.

## Users

- Developers using the Workbench two-tier authorization surface.
- Future agents extending scoped automation without creating duplicate runtime
  or permission frameworks.

## Acceptance Criteria

- AC-001: When the current primary gate is `result.refresh-rework`, scoped
  automation may execute that existing workflow action with explicit `changeId`
  and `worktreeId`, then re-read evidence before any next step.
- AC-002: When the current primary gate is `result.revalidate` or
  `result.reaudit`, scoped automation may refresh only that worktree evidence
  and must not mutate the source root.
- AC-003: A successful recovery path can continue through validation/audit,
  automatically consume safe `audit.accept` only for audit status `approved`,
  and stop at `result.apply`.
- AC-004: `result.apply`, `change.close`, remote, merge, push, Harness
  evolution, `approved-with-notes`, blocked, stale, missing, forged,
  cross-change, source drift, budget exhaustion, and handler failures stop or
  fail closed.
- AC-005: Workbench UI shows `完全访问权限` only for allowed local automation gates,
  hides duplicate primary gates while automation is running, and avoids future
  capability claims.
- AC-006: The change records source safety and real UI acceptance using an
  E-drive external sandbox.

## Non-Goals

- No automatic `planning.generate`.
- No automatic source apply, close/archive, merge, push, remote landing, or
  Harness evolution.
- No full-auto task mode, scheduler loop, parallel executor, slot allocator, or
  child Change auto creation.
- No new evidence family, permission system, action registry, projection
  framework, or rework state machine.

## Constraints

- Reuse `automation-runtime`, Workbench current-gate revalidation, existing
  Workbench action handlers, and confirmation queue projection.
- Every automated child step must be derived from the current
  `confirmationQueue.primary` snapshot.
- All write-capable work continues in AHO-owned worktrees.
- Real acceptance directories must be under `E:\aho-accept\...`, not C drive.

## Risks

- Rework can become unsafe if automation infers repair intent from stale
  validation/audit files instead of the current primary gate.
- UI can overstate full automation if `完全访问权限` appears for apply/close or
  unsupported gates.
- Aggregate Workbench tests may exceed the tool window; split evidence must be
  recorded if that happens.
