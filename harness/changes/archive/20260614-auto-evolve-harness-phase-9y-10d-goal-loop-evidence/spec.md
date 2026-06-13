# Spec: Auto Evolve Harness Phase 9Y 10D Goal Loop Evidence

## Goal

Evaluate whether the Phase 9Y-10D archive window should change Harness rules, templates, or lint checks. The evaluation must be evidence-backed, independently reviewed, and completed through `harness-evolve.ps1 mark-complete`.

## Users

- Future AHO agents implementing goal-loop or scheduler continuation features.
- Maintainers relying on ECL review templates to prevent hidden execution or confirmation bypasses.
- The user, who expects persistent Goal/Change loops to remain Harness-first and human-gated.

## Acceptance Criteria

- AC-001: The pending evolution window is reviewed from current archive evidence and an evolution proposal is recorded.
- AC-002: Authorized subagent review is recorded with scope, recommendation, score, and limitations.
- AC-003: If a durable rule gap exists, the smallest docs/template/lint delta is implemented; otherwise the result is `noop/subagent_review`.
- AC-004: The proposal and `reviews/review.md` explicitly address GoalLoopDecision recommended-action boundaries, fallback confirmation priority, ToolPolicyGate / human gate authority, and scheduler terminal evidence.
- AC-005: `harness-evolve.ps1 mark-complete` removes `harness/evolution/pending.md` and records the result.
- AC-006: `AGENTS.md` and `docs/STATUS.md` end with active none, pending none, and latest Harness evolution pointing to this archived change.
- AC-007: No product runtime, Workbench action, route, CLI, UI, scheduler execution, child Change, source mutation, ODWF runtime, or cache/replay behavior changes are introduced.
- AC-008: Harness verification passes, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not modify product feature code.
- Do not implement a Goal Loop Controller, scheduler loop, or parallel executor.
- Do not change `planning.goal-loop.evaluate` behavior unless review uncovers a correctness bug.
- Do not add broad static heuristics that try to infer goal-loop safety from file size or action names.

## Constraints

- `README.md` remains unrelated and untracked.
- Subagent review is advisory; the main agent still owns proposal, mark-complete, verification, close, and commit.
- Any Harness change must be minimal and evidence-backed by the candidate window.

## Risks

- Overfitting a permanent Harness rule to one implementation detail.
- Under-specifying Goal Loop confirmation boundaries and allowing future agents to expose recommended actions as hidden execution.
- Treating multi-worktree or scheduler evidence as merge safety instead of routing through IntegrationCheck, aggregate validation/audit, and human apply gates.
