# workbench-post-apply-local-landing-autonomy-v1

## Purpose

Extend the existing scoped `完全访问权限` local automation so a user-confirmed
post-plan run can continue past local `result.apply` into the existing local
`landing.prepare` evidence/readiness gate. If landing preparation produces a
fresh local `change.close` gate, the same scoped authorization may close the
Change; if it reaches PR, remote, merge, integration apply/discard, Harness
evolution, or a blocker, automation must stop and return the real gate to the
user.

This change only fills the post-apply local landing gap. The follow-up product
direction `workbench-confirmation-feedback-to-rework-v1` is recorded for later:
when a user gives modification feedback at a confirmation point, AHO should
revise/rework and return to confirmation/continuation. That feedback loop is
not implemented here.

## Scope

In scope:

- Add `landing.prepare` to the existing scoped automation allowed local workflow
  gate set.
- Keep `landing.prepare` bound to the current selected Change, current
  confirmation queue primary gate, and explicit `worktreeId` or `applyCheckId`.
- Reuse current-gate revalidation, existing landing action handler, Workbench
  confirmation projection, and scoped automation runtime.
- Ensure automation stops at PR, remote, merge, post-merge, integration
  apply/discard, Harness evolution, or blockers.
- Update tests and closeout handoff to name the later confirmation-feedback
  product slice without presenting it as current capability.

Out of scope:

- Automating plan confirmation.
- Automating raw `planning.scheduler.*`.
- Automating integration apply/discard, PR, remote, merge, post-merge, or
  Harness evolution.
- Implementing confirmation-point feedback-to-rework.
- Adding a new workflow runtime, permission system, projection framework, or
  evidence family.

## Current Status

Completed / ready to close.

## Verification

Passed:

- `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workflow-actions.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
  - First attempt hit an aggregate-only DOM lookup miss in an existing
    controlled-loop test; `tests/unit/web-app.test.tsx` passed alone, and the
    same targeted command passed on rerun.
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Real E-drive UI acceptance is not claimed for this narrow gate-eligibility
patch. The change reuses the already accepted local apply/close path and adds
unit/DOM/Workbench aggregate coverage proving `landing.prepare` can be consumed
only as the current selected-Change local gate and that remote/high-impact gates
remain outside scoped automation.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded for real UI acceptance.
- External source/state safety: `landing.prepare` remains a local
  evidence/readiness action; source mutation is still performed only by the
  existing `result.apply` path and tested through the automation sequence and
  high-impact gate exclusions.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  `workbench-confirmation-feedback-to-rework-v1` is the later product slice for
  confirmation-point modification feedback.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: closeout updates only the compact current
  baseline and next-product-direction pointers.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: handoff now points to
  `workbench-confirmation-feedback-to-rework-v1` as a later product slice, not
  current capability.
- Old experience retained / merged / retired / archive-only: detailed
  verification remains archive-only; entry docs retain only current behavior.
