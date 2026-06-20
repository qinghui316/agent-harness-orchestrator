# Controlled Scheduler Stop Handoff

## Purpose

Make controlled scheduler advance feel like a useful bounded continuation instead of a raw one-step executor. After `planning.scheduler.controlled-advance.run` executes exactly one legal scheduler transition, the result should include a derived post-step handoff that explains what stopped, whether the next confirmation candidate has fresh non-executing readiness evidence, and when the user or main Agent should re-evaluate.

This is a product-surface improvement over existing Goal Loop / Scheduler evidence. It must not introduce a scheduler loop, a new workflow-truth state machine, or any authority beyond the existing concrete scheduler gate, ToolPolicyGate, stale revalidation, and human confirmation path.

## Scope

In scope:

- Add a derived `postStepHandoff` result DTO for controlled scheduler advance.
- Reuse existing post-step Goal Loop evaluation, controller policy, gate-readiness preflight, and Workbench user-surface copy.
- Update user-facing result summaries so users can see whether the run stopped with a ready next confirmation candidate or needs re-evaluation.
- Add focused unit coverage for ready, warning, and refresh-failed post-step handoff states.
- Perform real UI validation if this change reaches rendered Workbench/browser behavior; otherwise record why backend projection/result validation is the applicable scope.

Out of scope:

- Automatic scheduler loops or multi-step continuation.
- Whole-wave dispatch, slot allocation, start-all, child Changes, or full parallel executor behavior.
- Scheduler-owned apply/discard, merge, close/archive, remote landing, or Harness evolution.
- Treating readiness evidence as ToolPolicy authorization or human approval.
- Broad roadmap, architecture, or test-topology refactors.

## Current Status

Ready to close.

## Verification

- `npm run lint` - passed.
- `npm run typecheck` - passed.
- `npx vitest run tests/unit/controlled-scheduler-advance-post-step.test.ts tests/unit/workbench-action-results.test.ts` - passed, 2 files / 7 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed after active handoff alignment.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed, no pending evolution.

The earlier `npm run test -- controlled-scheduler-advance-post-step workbench-action-results` attempt timed out because the package `test` script runs the broad aggregate suite instead of forwarding the file filter. The targeted Vitest command above was used for the scoped suite.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested that future product features requiring real UI validation must be validated in the real UI, not with fake acceptance.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: not applicable; this change did not alter React/browser rendering.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: active change, `AGENTS.md`, and `docs/STATUS.md` handoff only.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
