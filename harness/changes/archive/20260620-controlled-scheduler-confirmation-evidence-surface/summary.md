# controlled-scheduler-confirmation-evidence-surface

## Purpose

Show the evidence behind a refreshed controlled Scheduler reconfirmation directly in the right confirmation card. The previous change made Workpad Goal Loop details show the refreshed next candidate; this change carries the same ready evidence refs into the actual decision card.

## Scope

In scope:

- Merge ready controlled Scheduler next-candidate evidence refs into confirmation queue items.
- Render confirmation card evidence refs as read-only links.
- Verify the projection and real App DOM surface.

Out of scope:

- No workflow action, server route, scheduler runtime, ToolPolicy, source apply, close, merge, remote landing, or Harness evolution changes.
- No transient action-result truth.

## Current Status

Ready to close.

## Verification

- `npm run typecheck`
- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx`
- `npm run lint`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: implementation-after subagent review requested one stale/mismatched-gate regression test; added and passed.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: real React App DOM coverage in `tests/unit/web-app.test.tsx`; projection coverage in `tests/unit/workbench-goal-loop-surface.test.ts`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active handoff/status updates only.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: archive history remains archive-only.
