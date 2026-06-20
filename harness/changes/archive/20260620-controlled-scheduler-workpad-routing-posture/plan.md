# Plan: controlled-scheduler-workpad-routing-posture

## Approach

Reuse the existing `controlledSchedulerNextCandidate.routingPosture` DTO. Add one small Workbench frontend component/helper that passively renders the sanitized posture strings. Use it from the right confirmation card and the Workpad Goal Loop card. The Workpad primary surface will show concise posture copy by default, and the diagnostic details card will show the full posture including reasons.

## Steps

1. Add a shared Workbench frontend controlled Scheduler routing posture renderer/helper.
2. Replace the inline right-card posture rendering with the shared renderer while preserving text, evidence links, and button count.
3. Render concise posture copy in `GoalLoopPrimarySummary` when `goalLoop.controlledSchedulerNextCandidate.routingPosture` exists.
4. Render full posture details in `GoalLoopEvidenceCard`.
5. Add/update real React DOM tests for Workpad default/detail posture visibility, forbidden visible terms, and no fake action/button.
6. Run targeted web/read-model tests, typecheck, lint, build, Harness checks, independent close-ready review, then close/git if clean.

## Decisions

- The frontend renderer owns only presentation of already-sanitized strings; read-model derivation remains in `src/workbench/projections/read-model/goal-loop-next-candidate.ts`.
- The Workpad default surface must show at least concise posture; detail-only rendering is insufficient for the product goal.
- No product runtime or action behavior changes are in scope.

## Module Boundary Plan

- Owner module: Workbench frontend panel/helpers under `src/web/src/panels/workbench/`.
- New / moved responsibilities: shared passive routing-posture rendering for Workbench controlled Scheduler surfaces.
- Facade touch points: `DecisionPanels.tsx` and `workpad/GoalLoopCards.tsx` consume the shared renderer.
- Forbidden write-back locations: no scheduler policy in frontend, App shell, bridge/server glue, manager facades, Workbench action handlers, or read-model derivation changes.
- Compatibility surface: existing Workbench DTOs, confirmation item actions, payload ids, and right-card behavior remain compatible.
- Boundary tests: real React DOM tests for Workpad and right card plus typecheck/lint/build.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing read-model-derived routing posture, Workbench Goal Loop card, right confirmation card, Workbench User-Surface Honesty test pattern.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed.
- Domain-specific logic location: user-facing rendering belongs in Workbench frontend surfaces.
- Shared cross-cutting logic location: read-model derivation remains in the existing projection owner; shared frontend renderer avoids duplicate UI fragments.
- Local framework / state machine / projection / validation / gate avoided: avoids frontend scheduler policy, new projection state, new action source, and duplicate rendering branches.
- Future-cost reduction for similar features: future controlled Scheduler surfaces can reuse the same renderer for already-derived posture copy.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Plan self-review subagent `019ee54c-3c64-7d23-8329-60314608b39d` passed with conditions: keep scope frontend rendering only, show concise posture in default Workpad surface, keep right-card behavior equivalent, use real DOM coverage, and record Workbench honesty / Goal Loop / projection / module / core reuse review coverage.
