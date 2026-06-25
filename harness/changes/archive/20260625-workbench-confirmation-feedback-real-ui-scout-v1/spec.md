# Spec: workbench-confirmation-feedback-real-ui-scout-v1

## Goal

Verify the product-visible confirmation feedback loop through the real Workbench UI. A user should be able to enter feedback at a real primary confirmation gate and see AHO route that feedback into the existing revise or bounded rework path, without treating the feedback as approval or source mutation authority.

## Users

Developers using Workbench to correct an AI plan or result at a confirmation point.

## Acceptance Criteria

- AC-001: In a real browser Workbench session, plan-confirm feedback routes to existing `planning.revise` and returns to a new planning confirmation gate.
- AC-002: Plan-confirm feedback does not write canonical `spec.md`, `plan.md`, `tasks.md`, or accepted AC artifacts before the revised plan is confirmed.
- AC-003: In a real browser Workbench session, result/apply feedback routes to existing bounded `result.refresh-rework`, includes the user feedback in rework context, and returns through validation/audit to a result/apply gate or a clearly classified blocker.
- AC-004: Result/apply feedback does not mutate the external source root before a real apply gate.
- AC-005: Feedback target ids are scoped to the current selected Change and current `confirmationQueue.primary`; stale, missing, forged, or cross-change targets must fail closed if encountered.
- AC-006: If the real UI scout finds a product blocker, the fix must be minimal and placed in the existing owner path rather than adding a new feedback runtime or projection framework.
- AC-007: The active change records real UI evidence, source/home paths, demand/change ids, feedback decision ids, revise/rework artifacts, source status, and any blocker classification.

## Non-Goals

- Implementing running-turn interrupt / steer redesign.
- Adding full-auto, full parallel executor, scheduler loop, child Change creation, remote merge, PR feedback automation, or Harness evolution automation.
- Replacing existing `planning.revise`, `result.refresh-rework`, confirmation queue, current-gate revalidation, or source safety paths.

## Constraints

- Use E-drive external sandbox only; do not use C-drive acceptance directories.
- Do not use fixture pass, fake Codex, mocked PATH, or hand-written run artifacts as product success evidence.
- Do not treat feedback as approval; all canonical transitions still require their existing gates.
- Keep unrelated untracked `README.md` out of this change.

## Risks

- Real Codex / provider / auth failure can block acceptance; classify it as environment/provider rather than faking success.
- Codex output quality may fail validation or audit; route through existing bounded rework when legal.
- The UI may expose the feedback editor but route payloads incorrectly; fix the payload or server route owner only if observed.
