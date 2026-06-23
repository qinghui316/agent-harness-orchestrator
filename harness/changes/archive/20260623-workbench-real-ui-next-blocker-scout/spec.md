# Spec: workbench-real-ui-next-blocker-scout

## Goal

Verify, through real browser UI use against an external sandbox project, whether
the current Workbench manual-gated local loop still has a concrete product
blocker after the real Codex acceptance and close-gate projection fixes.

## Users

- A developer using AHO Workbench to carry a normal local project demand from
  request to verified result, explicit apply, and close.
- Future agents deciding whether to continue hardening the manual loop or move
  to verification-cost work.

## Acceptance Criteria

- AC-001: The scout uses an external managed project source root and external
  AHO runtime home, separate from the AHO development checkout.
- AC-002: The scout starts from a real browser UI demand and records visible
  primary gate evidence for each reached stage.
- AC-003: If `code.run` is reached, the pass evidence includes real
  `coder-codex` worktree run artifacts, not fake Codex, mocked PATH, fixture
  result, or hand-written artifacts.
- AC-004: If validation/audit/result/apply/close are reached, the change
  records validation/audit artifacts, result review state, apply before/after
  source status, and close/archive path.
- AC-005: If the scout fails, the failure is classified as product path bug,
  Codex agent-quality issue, validation/audit failure, source safety blocker,
  or environment/provider blocker.
- AC-006: Any product blocker fix stays minimal and reuses existing Workbench
  action, projection, server revalidation, runtime, validation/audit, apply, or
  close mechanisms.

## Non-Goals

- Full-auto task mode.
- Scheduler loop runtime, parallel executor, slot allocator, whole-wave
  dispatch, or child Change auto creation.
- Remote PR, push, merge, merge queue, provider landing, or ready-for-review.
- New evidence family, summary layer, fake automation, or UI buttons for future
  capabilities.

## Constraints

- `README.md` remains unrelated and untracked.
- Server/API evidence may supplement but must not replace real browser UI
  evidence.
- The AHO development checkout must not be used as the managed project under
  test.
- High-impact source apply and close/archive remain human-gated.
- If product code changes, verification starts from the touched boundary and
  escalates when shared Workbench contracts are touched.

## Risks

- Codex/environment failures may prevent reaching `code.run`; record them as
  environment/provider blockers rather than faking success.
- Codex may produce a bad candidate; route through bounded Workbench rework or
  record Codex agent-quality failure.
- Workbench aggregate tests may be expensive; split evidence may be needed if
  aggregate exceeds the tool window without assertion failures.
