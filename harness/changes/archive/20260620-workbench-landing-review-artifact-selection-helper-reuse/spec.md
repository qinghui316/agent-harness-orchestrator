# Spec: workbench-landing-review-artifact-selection-helper-reuse

## Goal

Reduce repeated Workbench landing review artifact selection logic by moving the display-choice rule into a shared landing-specific helper.

## Users

- AHO users reviewing landing, Draft PR, and remote handoff evidence in the Workbench.
- Future AHO developers extending landing or remote handoff surfaces.

## Acceptance Criteria

- AC-001: Landing review artifact selection has one shared helper that prefers the generated merge review artifact when present.
- AC-002: Landing confirmation projection surfaces use the helper instead of local `merge-review.md` / `artifactRefs[1]` fallback logic.
- AC-003: Landing-related Workbench action handlers use the helper for the same review artifact selection without importing read-model helpers or expanding the generic action-result facade.
- AC-004: Existing Workbench action ids, payloads, human confirmation gates, ToolPolicy behavior, remote provider behavior, PR/merge behavior, and source apply behavior remain unchanged.
- AC-005: Targeted tests cover helper behavior, owner purity, and the absence of repeated local artifact selection in the touched files.

## Non-Goals

- Do not introduce a generic artifact selection framework.
- Do not change landing package generation, merge review rendering, remote handoff execution, Draft PR creation, PR review, remote landing, landing queue, scheduler, Goal Loop, or maintenance behavior.
- Do not move main logic into compatibility facades such as Workbench chat, manager, server, or generic action result handling.

## Constraints

- The helper must be landing-specific and small.
- `remote-handoff.ts` must not depend on read-model projection helpers.
- `landing.ts` must not depend on `src/workbench/actions/results.ts`.
- The change must keep current public Workbench DTO/action shapes compatible.
- Verification should be targeted-first; full `npm run test` is only required if implementation touches broad dispatch, provider, scheduler, Goal Loop, or aggregate runtime behavior.

## Risks

- A too-generic helper would create another artifact mini-framework instead of reducing duplication.
- Placing the helper under read-model would create an inverted dependency from action handlers to projection code.
- Accidentally changing fallback order could alter which evidence artifact users see first.

