# controlled-scheduler-confirmation-candidate-detail

## Purpose

Surface the ready controlled Scheduler next-candidate detail on the right confirmation card, reusing the existing Workpad candidate evidence so the user sees the same ready next step in the unique executable confirmation surface.

## Scope

In scope:

- Optional confirmation item / decision context detail sourced from `WorkbenchControlledSchedulerNextCandidate`.
- Read-model attachment only when the existing refreshed controlled Scheduler reconfirmation predicate passes and the candidate is `ready-for-confirmation`.
- Passive React rendering in the right confirmation card.
- Unit and real React App DOM coverage.

Out of scope:

- No new button, action, server route, scheduler runtime, Goal Loop policy, ToolPolicyGate, source apply, close, merge, IntegrationCheck, or Harness evolution behavior.
- No `needs-review` candidate detail on executable confirmation cards.

## Current Status

Closed.

Plan review passed via subagent `019ee4f8-d4e1-73b0-ab25-67d8a05238b4`. Implementation is complete and implementation-after review is close-ready. The right confirmation card now renders ready next-candidate detail as passive copy while preserving one controlled Scheduler advance action.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan review required ready-only attachment and real DOM coverage for the UI-visible card detail.
- Implementation-after review: subagent `019ee4c4-9e5d-7ac3-9509-02df276ce7d5` found no source/test boundary blocker; its ECL close-ready finding was resolved by updating tasks, summary, review, and handoff state.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: real React App DOM validation covered by `tests/unit/web-app.test.tsx`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active handoff/status updates only.
- Experience lifecycle result: not applicable.
- Historical detail remains archive-only.
