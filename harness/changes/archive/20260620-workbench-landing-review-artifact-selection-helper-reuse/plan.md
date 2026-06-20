# Plan: workbench-landing-review-artifact-selection-helper-reuse

## Approach

Create one small landing-specific Workbench helper for review artifact display selection, then mechanically replace duplicated selection logic in landing confirmation projections and landing-related action handlers. Keep the helper narrow: it chooses a display artifact from an existing list; it does not read files, validate artifacts, mutate landing state, or authorize actions.

## Steps

1. Add `src/workbench/artifact-selection.ts` with a `selectLandingReviewArtifactRef` helper.
2. Replace repeated landing review artifact selection in `src/workbench/projections/read-model/confirmation/landing.ts`.
3. Replace the same landing review selection in `src/workbench/actions/handlers/remote-handoff.ts`.
4. Add targeted boundary tests for helper behavior, owner purity, import direction, and repeated-pattern drift.
5. Run targeted Workbench/remote landing tests plus typecheck/lint/build and Harness checks.

## Decisions

- The helper owner is `src/workbench/artifact-selection.ts`, not `src/workbench/actions/results.ts`, because the rule is a Workbench display choice for landing review evidence rather than generic action-result extraction.
- The helper is not placed under read-model because action handlers also need it and should not import projection helpers.
- The helper remains landing-specific to avoid creating a broad artifact-selection framework.

## Module Boundary Plan

- Owner module: `src/workbench/artifact-selection.ts`.
- New / moved responsibilities: landing review evidence display artifact selection.
- Facade touch points: `src/workbench/projections/read-model/confirmation/landing.ts` and `src/workbench/actions/handlers/remote-handoff.ts` consume the helper only.
- Forbidden write-back locations: `src/workbench/actions/results.ts`, read-model helper files for action-handler use, Workbench chat/server/frontend facades, landing domain mutation paths.
- Compatibility surface: Workbench confirmation queue items, thread entries, action ids, action payloads, and live assistant events retain existing shapes.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts` helper/import/drift coverage.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench shared helper pattern already used by `evidenceActions` and `evidenceRefs`.
- Why existing mechanisms are insufficient if a new mechanism is proposed: existing helpers build actions or plain ref arrays; they do not own landing review artifact fallback choice.
- Domain-specific logic location: landing-specific artifact display choice in `src/workbench/artifact-selection.ts`.
- Shared cross-cutting logic location: no new cross-cutting workflow mechanism; this is a shared Workbench display helper.
- Local framework / state machine / projection / validation / gate avoided: avoids repeating local artifact fallback choices in each landing projection/action branch.
- Future-cost reduction for similar features: future landing/remote handoff surfaces can call one helper instead of re-encoding `merge-review.md` and fallback order.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review recommended revising the initial plan to avoid `actions/results.ts`, avoid read-model helper ownership, cover both landing confirmation and remote-handoff landing review branches, and keep verification targeted-first.

