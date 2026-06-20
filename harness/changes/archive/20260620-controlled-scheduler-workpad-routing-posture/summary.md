# controlled-scheduler-workpad-routing-posture

## Purpose

Make the Workpad Goal Loop surface show the same sanitized controlled Scheduler routing posture that the right confirmation card already receives from the read model. The user should understand from the main Workpad surface why the current path is low-conflict, sequential, blocked, or otherwise constrained, and why continuing still means one human-confirmed step rather than an automatic scheduler loop.

This is a frontend/read-model presentation change only. It reuses the existing `controlledSchedulerNextCandidate.routingPosture` copy and does not change scheduler runtime, Goal Loop policy generation, action payloads, stale revalidation, ToolPolicyGate, or human gates.

## Scope

In scope:

- Shared Workbench frontend renderer/helper for controlled Scheduler routing posture copy.
- Right confirmation card rendering moved to that shared renderer without behavior or action changes.
- Workpad Goal Loop default surface shows concise routing posture when available.
- Workpad Goal Loop details show full posture reasons when available.
- Real React/App DOM coverage for Workpad-visible posture, forbidden raw terms, and no fake/duplicate action.

Out of scope:

- No read-model derivation changes.
- No scheduler runtime, Goal Loop policy, action payload, stale revalidation, ToolPolicyGate, source apply, close, merge, remote landing, or Harness evolution changes.
- No automatic loop, whole-wave dispatch, slot allocation, full parallel executor, source mutation, or hidden continuation.

## Current Status

Ready to close.

Plan review subagent `019ee54c-3c64-7d23-8329-60314608b39d` passed. Implementation is ready to proceed within the frontend-only rendering scope.

Implemented as a shared Workbench frontend renderer reused by the right confirmation card and Workpad Goal Loop surfaces. The default Workpad surface now shows concise controlled Scheduler routing posture, and the diagnostic evidence card shows the full posture with reasons. No read-model derivation, scheduler runtime, Goal Loop policy, action payload, stale revalidation, ToolPolicyGate, human gate, apply, close, merge, remote landing, or Harness evolution behavior was changed.

Implementation close-ready subagent `019ee554-3927-7e20-9c4d-55e5c7d17b97` passed. It reran the real DOM test, ECL lint, encoding lint, harness status, and Harness evolution check; no blocking issues were found.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx` passed: 32 tests. Includes real React/App DOM coverage for Workpad-visible routing posture, full evidence-card reasons, forbidden raw terms, no fake Workpad action, and the existing right confirmation card path.
- `npm run typecheck` passed.
- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts tests/unit/controlled-scheduler-post-step-projection.test.ts` passed: 21 tests.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:fast` passed: 35 files, 376 tests.
- Subagent `019ee554-3927-7e20-9c4d-55e5c7d17b97` reran `npx vitest run tests/unit/web-app.test.tsx`, `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`, `scripts/harness-change.ps1 status`, and `scripts/harness-evolve.ps1 check`; all passed or aligned, with close-ready pending only the final T-005 bookkeeping at review time.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: plan review requires default Workpad surface to show at least concise routing posture; detail-only rendering is not enough.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: plan review subagent `019ee54c-3c64-7d23-8329-60314608b39d`; close-ready review subagent `019ee554-3927-7e20-9c4d-55e5c7d17b97`; real React/App DOM test `tests/unit/web-app.test.tsx`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to active handoff updates only. `AGENTS.md` stayed 108 lines and `docs/STATUS.md` stayed 132 lines before and after the active handoff update.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
