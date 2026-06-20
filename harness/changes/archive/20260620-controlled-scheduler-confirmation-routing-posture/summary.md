# controlled-scheduler-confirmation-routing-posture

## Purpose

Make the current Goal Loop conflict/routing posture visible on the right controlled Scheduler confirmation card. The user should be able to see why the current step is only one human-confirmed transition, whether the evidence says the path is low conflict or must stay sequential/integration/blocked, and why this is not an automatic scheduler loop.

The change must reuse existing Goal Loop summary, Scheduler execution-mode evidence, and controlled Scheduler next-candidate projection. It is UI/read-model presentation only: no scheduler runtime behavior, action payload, stale revalidation, ToolPolicyGate, or human gate changes.

## Scope

In scope:

- User-facing routing posture copy derived in the Workbench read-model owner for controlled Scheduler next-candidate detail.
- Optional DTO fields for the controlled Scheduler next-candidate projection and frontend rendering.
- Right confirmation-card rendering of that already-derived copy.
- Real App DOM coverage that the right card shows the posture while keeping exactly one controlled advance action.

Out of scope:

- Scheduler runtime, Goal Loop policy generation, action attachment rules, action payload target ids, stale revalidation, ToolPolicyGate, and human gate behavior.
- Automatic scheduler loops, whole-wave dispatch, slot allocation, full parallel executor, source mutation, apply, close, remote landing, or Harness evolution.
- Rendering raw `routingPosture`, `schedulerExecutionMode.mode`, action ids, artifact ids, or enum strings in the confirmation card.

## Current Status

Ready to close.

## Verification

- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts` passed: 19 tests.
- `npx vitest run tests/unit/web-app.test.tsx` passed: 32 tests, including real App DOM coverage for the right confirmation card.
- `npx vitest run tests/unit/workbench-action-results.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-read-model.test.ts` passed: 31 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:fast` first run had one unrelated lazy graph timing failure in `web-app`; the failing single test passed on direct rerun, and a second full `npm run test:fast` passed: 35 files, 376 tests.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: one `test:fast` run had a transient lazy graph DOM timing miss unrelated to this change; the targeted failing test and a full `test:fast` rerun both passed.
- Screenshots / artifacts / run ids: real App DOM test `renders refreshed controlled scheduler reconfirmation copy in the right confirmation card` verifies the visible routing posture and single controlled advance action.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

