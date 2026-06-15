# Spec: Auto Evolve Harness Phase 10P 10T Goal Loop Controller Evidence

## Goal

Close the Phase 10P-10T pending Harness evolution window with explicit evidence about whether Goal Loop controller/feedback/context/prompt work requires new Harness rules.

## Users

Future agents working on AHO Goal Loop, Workbench main-Agent prompt context, and Harness-gated autonomous loop behavior.

## Acceptance Criteria

- AC-001: `harness/evolution/pending.md` is handled and removed by `mark-complete`.
- AC-002: Evolution proposal, review notes, validation notes, results row, and mark-complete evidence are recorded.
- AC-003: Subagent review records scope, recommendation, score, rationale, and limitations.
- AC-004: Result is `noop/subagent_review` unless review finds a concrete uncovered Harness rule gap.
- AC-005: Handoff docs end with active none, pending evolution none, and latest Harness evolution pointing to this archived change.
- AC-006: No product code, runtime behavior, Workbench action, route, CLI command, UI, scheduler execution, source mutation, child Change, or artifact shape changes.
- AC-007: Harness verification passes, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not alter Goal Loop runtime behavior.
- Do not add a new controller, scheduler, autonomous loop, action, route, CLI, UI, worker prompt, or product artifact.
- Do not edit unrelated `README.md`.

## Constraints

- Evolution is advisory unless a concrete rule gap is identified.
- Existing Goal Loop Boundary, Runtime Bridge Boundary, Module Boundary, ToolPolicy/human gate, and workflow-truth rules must be considered before proposing a new rule.

## Risks

- Overfitting a new rule to already-covered acceptance tests could make future work slower without improving safety.
- Under-recording the review could leave future agents unsure whether controller policy prompt evidence is already covered.
