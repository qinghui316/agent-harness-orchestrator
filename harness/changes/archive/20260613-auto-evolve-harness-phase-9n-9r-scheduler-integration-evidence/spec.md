# Spec: Auto Evolve Harness Phase 9N 9R Scheduler Integration Evidence

## Goal

Determine whether Phase 9N through Phase 9R exposed a new Harness rule gap around scheduler rework evidence, scheduler integration candidates, IntegrationCheck handoff, or IntegrationCheck outcome accounting.

## Users

- Maintainers using AHO Harness/ECL to keep scheduler runtime changes bounded.
- Future agents implementing scheduler integration or parallel execution slices.

## Acceptance Criteria

- AC-001: `harness/evolution/pending.md` is handled and removed by `mark-complete`.
- AC-002: A proposal under `harness/evolution/proposals/` records the Phase 9N-9R evaluation and conclusion.
- AC-003: Authorized subagent review records scope, recommendation, score, and limitations.
- AC-004: Result records `modify/subagent_review` because concrete template/lint gaps were found.
- AC-005: Docs end with accurate active change, pending evolution, and latest evolution state.
- AC-006: No product code or runtime behavior changes are introduced by this evolution.
- AC-007: Harness verification passes, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not add or change scheduler runtime behavior.
- Do not add product actions, routes, CLI commands, UI, IntegrationCheck behavior, apply/discard behavior, or merge behavior.
- Do not add broad scheduler/workflow-truth rules; only add narrow template/lint rules for concrete uncovered recurring risks.

## Constraints

- The pending evolution was generated after five archived changes: Phase 9N, 9O, 9P, 9Q, and 9R.
- Existing rules already include module owner boundaries, proposal/runtime distinction, scheduler non-execution boundaries, ToolPolicy/human gate authority, and workflow truth separation.
- `README.md` remains unrelated and untracked.

## Risks

- Overfitting a new rule to already covered scheduler evidence phases could add process noise.
- Missing an IntegrationCheck/apply authority gap could allow future scheduler work to duplicate source-root mutation controls.
- Handoff drift could leave docs claiming a completed product phase is still active.

