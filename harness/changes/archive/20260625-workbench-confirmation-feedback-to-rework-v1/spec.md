# Spec: workbench-confirmation-feedback-to-rework-v1

## Goal

When a user rejects or qualifies a Workbench confirmation item with concrete modification feedback, AHO routes that feedback into the existing same-Change revise/rework path and returns the user to a fresh confirmation point. Feedback must be scoped to the current primary gate and must not become approval authority.

## Users

- Developers using Workbench to review a generated plan or implementation result.
- Agents resuming a demand that has user feedback evidence and needs a revised plan or reworked result.

## Acceptance Criteria

- AC-001: At a `planning.confirm-execution` confirmation gate, submitting feedback records a scoped requested-changes decision, does not write canonical planning artifacts, runs the existing `planning.revise` path with the feedback in the revision prompt, and returns to a fresh planning confirmation gate.
- AC-002: At a result review / `result.apply` confirmation gate, submitting feedback records a scoped requested-changes decision, does not mutate the source root, runs the existing bounded `result.refresh-rework` path with the feedback in the rework prompt, and returns through validation/audit/result review.
- AC-003: Feedback submission revalidates against the current `confirmationQueue.primary`; stale, missing, forged, or cross-change feedback targets fail closed.
- AC-004: Unsupported confirmation gates record scoped feedback and stop without fake revise/rework, apply, close, remote, PR, merge, or Harness evolution behavior.
- AC-005: Workbench UI exposes inline "提出修改意见" for plan and result/apply gates, submits complete target context, and after routing does not keep the old gate visible as still confirmable.
- AC-006: The implementation reuses existing planning/rework/action/projection owners and does not introduce a new feedback runtime, permission system, projection system, workflow engine, or evidence family.

## Non-Goals

- Changing running-turn interrupt/steer behavior.
- Changing Goal Loop feedback evaluation semantics.
- Automatic PR/remote feedback rework.
- Automatic apply/close/merge/remote/Harness evolution.
- New scheduler, parallel executor, child Change, or workflow runtime.

## Constraints

- Plan confirmation remains a human boundary.
- Feedback is user evidence, not approval or workflow truth.
- Source root must not change before explicit apply or an existing scoped local apply authorization.
- `README.md` remains unrelated and untracked.

## Risks

- Over-general feedback routing could create a second hidden workflow engine.
- Feedback without current-gate revalidation could act on stale or cross-change targets.
- Result feedback must not bypass source safety or auto-apply a reworked result.
