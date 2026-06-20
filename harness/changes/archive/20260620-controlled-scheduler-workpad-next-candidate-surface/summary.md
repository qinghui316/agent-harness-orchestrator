# controlled-scheduler-workpad-next-candidate-surface

## Purpose

Keep the refreshed controlled Scheduler next-step candidate visible in Workpad Goal Loop details after a confirmed controlled advance stops. The current product already reports the post-step state in the transient thread result summary; this change makes the durable Workpad surface show whether the next candidate is ready for a fresh confirmation or needs review.

## Scope

In scope:

- Add an optional controlled Scheduler next-candidate DTO to the Workbench Goal Loop read model.
- Render that DTO in the Workpad Goal Loop evidence card as read-only user-facing state.
- Cover the projection and real React DOM UI path.

Out of scope:

- No new workflow action, runtime loop, automatic parallel dispatch, ToolPolicy path, source apply, close, merge, remote landing, or Harness evolution automation.
- No broader `GoalLoopCards.tsx` refactor.

## Current Status

Ready to close.

Implementation, targeted verification, Harness checks, and implementation-after subagent review are complete.

## Verification

Passed:

- `npm run typecheck`
- `npx vitest run tests/unit/controlled-scheduler-post-step-projection.test.ts tests/unit/web-app.test.tsx`
- `npm run lint`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Implementation-after subagent review passed and reran the targeted projection + real React DOM tests.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active handoff/status updates only.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: checked in `docs/STATUS.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
