# workbench-local-loop-scheduler-handoff-boundary-scout-v1

## Purpose

Verify the local Goal Loop handoff boundary when a selected Workbench demand
reaches a low-conflict scheduler-ready gate. Both execution modes should use
the same current-evidence loop: `请求批准` waits on the real current gate, while
scoped `完全访问权限` may enter the scheduler path only through the existing
controlled scheduler wrapper.

This change is a product scout with minimal-fix permission. If the current
path already behaves correctly, record real UI evidence and close. If it
exposes a product gap, fix only the owning path.

## Scope

In scope:

- E-drive external sandbox real UI acceptance.
- Workbench SQLite / memory boundary classification.
- Request-approval behavior at scheduler-ready gates.
- Full-access eligibility for `planning.goal-loop.controlled-continue.run`.
- Fail-closed behavior for raw scheduler, manual IntegrationCheck, integration
  apply/discard, remote, merge, PR, and Harness evolution gates.

Out of scope:

- Central workflow database.
- Full parallel executor, scheduler loop, slot allocator, or child Change.
- Raw `planning.scheduler.*` full-access allowlist expansion.
- Automatic manual IntegrationCheck, integration apply/discard, remote, merge,
  PR, or Harness evolution.

## Current Status

Completed / Ready to close.

## Verification

- Targeted Workbench/Goal Loop suites:
  `npx vitest run tests/unit/goal-loop-runtime.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
  passed, 135 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed, 58 files / 569 tests.
- `npm run build`: passed.
- `npm run test:workbench`: passed, 9 files / 138 tests.
- Real UI acceptance: passed with E-drive external sandbox.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first demand was intentionally contradictory
  and correctly blocked by scope honesty; the accepted demand was rerun with
  explicit `src/alpha.js` / `src/beta.js` scope.
- Workbench URL: `http://127.0.0.1:4332/`.
- External source: `E:\aho-accept\local-loop-scheduler-handoff-v1\src`.
- Runtime home: `E:\aho-accept\local-loop-scheduler-handoff-v1\home`.
- Accepted demand / Change:
  `src-alpha-js-src-beta-js-src-alpha-js-alphav`.
- Request-approval evidence: after manual plan confirmation with
  `请求批准`, Workbench stopped at the real `生成拆分提案` primary gate and did
  not auto-dispatch.
- Full-access scheduler handoff evidence: after manual raw scheduler
  preparation / direction confirmation, scoped automation consumed only the
  supported controlled scheduler wrapper and progressed same-Change worker
  worktrees.
- Automation run: `automation-run-20260626085522-b4d2c327`, stopped with
  `no-progress` after generating the ready integration candidate; no source
  apply occurred.
- Worker evidence:
  `wt-20260626-165524-c85d1c`,
  `wt-20260626-165826-7d728c`,
  validation/audit runs
  `run-20260626-165748-src-alpha-js-src-beta-js-src-alpha-js-alphav-0a727a`,
  `run-20260626-165752-src-alpha-js-src-beta-js-src-alpha-js-alphav-038d3d`,
  `run-20260626-170003-src-alpha-js-src-beta-js-src-alpha-js-alphav-3bf3a4`,
  and `run-20260626-170008-src-alpha-js-src-beta-js-src-alpha-js-alphav-cd599e`.
- Integration candidate:
  `scheduler-integration-candidate-14264028`, status `ready`.
- Final visible gate after fixes: manual
  `planning.scheduler.integration-check.run` / `检查组合结果`.
- Source/state safety: external source `git status --short` empty after the
  scout; no automatic IntegrationCheck, integration apply/discard, PR, remote,
  merge, or Harness evolution occurred.
- Product fixes recorded:
  - `src/workbench/projections/read-model/decision-inspector.ts` aligns
    `decisionInspector.primary` with the authoritative manual IntegrationCheck
    confirmation queue item.
  - `src/web/src/panels/workbench/DecisionPanels.tsx` prevents full-access
    wrapping of Goal Loop helper actions when their concrete current gate is a
    terminal/manual gate such as `planning.scheduler.integration-check.run`.
  - `src/web/src/types.ts` exposes the existing
    `goalLoopCurrentGateActionType` field to the frontend decision action type.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: no central workflow DB was
  needed; SQLite remained interaction/projection storage, while artifacts
  remained workflow truth.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff-only update required.
- Experience lifecycle result: archive-only product scout evidence.
- Roadmap/current-direction stale language check: pending closeout.
- Old experience retained / merged / retired / archive-only: detailed run ids
  and E-drive paths remain archive-only.

