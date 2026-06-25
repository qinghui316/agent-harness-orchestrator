# Spec: workbench-post-plan-scoped-automation-real-ui-scout-v1

## Goal

Verify the current product behavior through the real Workbench browser UI after
the scoped automation boundary change: plan confirmation must remain a human
gate, and `完全访问权限` must only automate post-plan local execution gates for the
selected Change.

## Users

- Developers using Workbench as the ordinary demand conversation UI.
- Future agents deciding whether the next product step can widen Goal-driven
  continuation or must first fix another Workbench blocker.

## Acceptance Criteria

- AC-001: A fresh E-drive external sandbox is used; the AHO development checkout
  is not the managed project under test and C-drive acceptance paths are not
  used.
- AC-002: In the real browser UI, the plan confirmation gate exposes only
  `请求批准`; `完全访问权限` is unavailable for `planning.confirm-execution`.
- AC-003: After the plan is human-confirmed, `完全访问权限` can be selected for an
  eligible post-plan local execution gate.
- AC-004: Scoped automation consumes only current enabled local execution gates
  for the selected Change, using existing target ids and stale revalidation.
- AC-005: Scoped automation stops at `result.apply`, a high-impact gate, a
  source/state drift condition, budget exhaustion, or a classified blocker; it
  does not auto-apply source changes.
- AC-006: Acceptance evidence records the Workbench URL, external source/home
  paths, visible primary gate sequence, automation run id and stop reason,
  Codex run artifacts when produced, validation/audit artifacts when produced,
  and external source `git status --short` before human apply.
- AC-007: If a product blocker is found, the fix is minimal, owned by the
  relevant Workbench/action/revalidation/runtime module, and verified with
  targeted tests.

## Non-Goals

- Implementing full-auto, a scheduler loop, a parallel executor, or child Change
  creation.
- Automatically applying, closing, merging, landing remotely, or applying
  Harness evolution.
- Adding a new permission system, evidence family, projection framework, or
  workflow runtime.
- Treating Goal Loop evidence, UI state, or Codex session state as workflow
  authority.

## Constraints

- Change/ECL artifacts, accepted plan artifacts, action target ids, validation,
  audit, worktree state, and human terminal gates remain workflow truth.
- The external sandbox must live under `E:\aho-accept\post-plan-auto-scout-v1`.
- Raw `planning.scheduler.*` actions remain outside direct `完全访问权限`.
- `README.md` remains unrelated and untracked.

## Risks

- Real Codex or validation may fail for environment/provider reasons; record
  that as a blocker instead of faking acceptance.
- The scout may expose a product bug; fix only the smallest owned path and keep
  this change scoped to acceptance hardening.
- Browser/UI automation may be limited by local tooling; API evidence may
  supplement but must not replace visible UI evidence.
