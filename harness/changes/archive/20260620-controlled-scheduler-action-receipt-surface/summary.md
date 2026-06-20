# controlled-scheduler-action-receipt-surface

## Purpose

Make the controlled Scheduler single-step action receipt visible immediately in the Workbench when the live workflow stream reports a terminal `workflow.completed` or `workflow.failed` message.

The change keeps the receipt as workflow/evidence UI, not Codex assistant prose. It reuses the existing `resultSummary` and controlled Scheduler post-step handoff copy so the live surface, snapshot thread projection, and decision history describe the same completed step and next candidate without creating new execution authority.

## Scope

In scope:

- Frontend live `topic.message` handling for terminal workflow messages.
- User-facing controlled Scheduler receipt copy already produced by `summarizeActionResult`.
- Real React DOM coverage for the live receipt before the final snapshot arrives.
- Regression checks that the live receipt does not create confirmation actions or leak internal scheduler ids/terms.

Out of scope:

- Scheduler runtime behavior, Goal Loop policy generation, ToolPolicyGate, stale revalidation, and confirmation queue derivation.
- Automatic Scheduler loops, whole-wave dispatch, slot allocation, source apply, close/archive, remote landing, or Harness evolution.
- Treating workflow receipts as Codex assistant transcript text.

## Current Status

Ready to close.

Implemented live terminal workflow receipt rendering for completed/failed workflow messages. The receipt is surfaced as workflow/evidence UI through existing thread/transcript rendering paths, not as Codex assistant markdown and not as a source of confirmation actions.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx` passed: 32 tests, including real React DOM coverage proving live SSE receipt visibility before snapshot replacement.
- `npx vitest run tests/unit/workbench-action-results.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-read-model.test.ts` passed: 31 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed: 35 files, 376 tests.
- `npm run build` passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: real App DOM test `renders controlled scheduler workflow receipts from live action SSE before snapshot replacement` verifies the visible receipt before the delayed snapshot event is released.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
