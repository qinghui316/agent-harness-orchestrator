# Plan: Phase 12L Scheduler Terminal Workpad Boundary Copy

## Approach

Keep the change entirely in the Workpad frontend display layer. Add concise authority-boundary copy to the SchedulerRun completion and blocked-closeout cards, then add DOM tests that render `WorkpadDiagnosticDetails` with terminal Workpad summaries and assert both the text and absence of card-local buttons.

## Steps

1. Update the two terminal SchedulerRun cards in `TypedWorkflowCards.tsx`.
2. Add focused `tests/unit/web-app.test.tsx` coverage for completion and blocked closeout card rendering.
3. Run targeted UI tests, typecheck/lint as practical, and Harness checks.
4. Record independent close-ready review evidence and update handoff before close.

## Decisions

- Plan self-evaluation: subagent Sartre returned PASS before ECL creation, with a narrower recommendation to touch only Workpad display and `tests/unit/web-app.test.tsx`.
- Reference evidence: `controlled-scheduler-loop.md`, `ref-loop-engineering.md`, and `ref-openai-codex.md` support explicit non-executing loop/goal/scheduler boundaries.
- Do not change `GoalLoopCards.tsx`; it already has false-authority DOM coverage for Goal Loop evidence.

## Module Boundary Plan

- Owner module: frontend Workpad typed workflow cards, `src/web/src/panels/workbench/workpad/TypedWorkflowCards.tsx`.
- New / moved responsibilities: two terminal-card display notes only; no domain policy, runtime transition, or artifact authority.
- Facade touch points: none planned.
- Forbidden write-back locations: scheduler runtime, Goal Loop compiler/policy, action registry, server/live action handlers, bridge/prompt context, schemas, workflow projection owners.
- Compatibility surface: existing Workpad summary shapes and card test ids remain stable.
- Boundary tests: DOM tests in `tests/unit/web-app.test.tsx` for card text and no button affordance.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None. The scope is intentionally UI/read-model regression only.
