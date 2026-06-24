# Goal-Driven Controlled Continuation Runtime V1

## Purpose

Implement the first bounded Goal-driven continuation runtime for Workbench.
After one explicit Workbench confirmation, AHO may continue the currently
matching controlled Scheduler gate for a small step budget by re-reading current
evidence before each step and dispatching only the existing
`planning.scheduler.controlled-advance.run` safety wrapper.

This change turns the proven one-step controlled Scheduler continuation into a
bounded product capability. It does not implement full-auto task mode, whole
wave dispatch, a parallel executor, child Change creation, or automatic
apply/merge/close.

## Scope

In scope:

- Add `planning.goal-loop.controlled-continue.run` as a scoped Workbench action.
- Add a `src/goal-loop-runtime/` owner for authorization, run, iteration, and
  stop-reason records.
- Revalidate current Workbench targets and Goal Loop packet/controller/preflight
  evidence before starting and before each child step.
- Execute child steps through the existing controlled Scheduler wrapper while
  preserving ToolPolicy and action-target audit evidence.
- Project one honest Workbench primary gate only when the current concrete
  Scheduler gate is supported and matching.

Out of scope:

- Full-auto task mode.
- Parallel executor, slot allocator, whole-wave dispatch, child Change creation.
- Automatic apply, merge, close, remote landing, or Harness evolution.
- Promoting GoalLoopDecision, packet, controller, preflight, Workpad, Topic, or
  UI state to workflow truth.

## Current Status

Completed; ready to close.

Continuation rationale: code, projection, action, targeted test work, real
browser UI smoke, full Workbench aggregate verification, and Harness checks for
bounded controlled continuation runtime V1 are complete.

Implemented:

- Added `planning.goal-loop.controlled-continue.run` as a high-impact,
  revalidated Workbench workflow action with explicit scoped target ids.
- Added `src/goal-loop-runtime/` authorization, run, iteration, stop-reason,
  and child-step orchestration records.
- Integrated the Workbench action handler with the existing
  `planning.scheduler.controlled-advance.run` handler without recursively
  entering the top-level Workbench action service.
- Preserved child step ToolPolicy / high-impact audit evidence by recording
  `coveredByGoalLoopRuntimeAuthorizationId` and `goalLoopRuntimeRunId`.
- Projected one bounded continuation primary gate only when the current visible
  gate is a fresh matching controlled Scheduler gate.
- Suppressed misleading full-auto / parallel-executor language in user-facing
  copy.
- Fixed a closeout projection regression found during real UI smoke: when a
  bounded continuation action wraps the current Scheduler gate, the
  authoritative confirmation queue now promotes that current Scheduler gate over
  stale decision context. The promotion is limited to `planning.scheduler.*`
  next actions so planning, landing, PR, remote, apply, and close gates keep
  their existing priority.

## Verification

Passed:

- `npx vitest run tests/unit/goal-loop-runtime.test.ts tests/unit/workflow-actions.test.ts tests/unit/web-workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/web-app.test.tsx`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts tests/unit/goal-loop-runtime.test.ts tests/unit/workbench-goal-loop-surface.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `npm run test:workbench:unit`
- `npm run test:workbench:slow:scheduler`
- `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`
- `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`
- `npx vitest run tests/slow/workbench-maintenance-flow.test.ts`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Real UI smoke:

- Browser URL: `http://127.0.0.1:4331/`.
- External source: `C:\aho-accept\continue-v1\src`.
- External runtime home: `C:\aho-accept\continue-v1\home`.
- Project id: `continue-v1-smoke`.
- Change id: `controlled-continuation-ui-smoke`.
- Initial visible primary gate: one `连续推进当前目标` confirmation with
  bounded continuation copy and no full-auto / parallel-executor language.
- During execution: composer showed `正在运行：连续推进当前目标`; the primary
  confirmation buttons were disabled, so duplicate confirmation was not
  exposed while the action was running.
- Runtime evidence:
  - authorization:
    `C:\aho-accept\continue-v1\home\projects\continue-v1-smoke\harness\changes\active\controlled-continuation-ui-smoke\planning\goal-loop-runtime\goal-loop-runtime-authorization-20260624024539-8864acb0.json`
  - run:
    `C:\aho-accept\continue-v1\home\projects\continue-v1-smoke\harness\changes\active\controlled-continuation-ui-smoke\planning\goal-loop-runtime\goal-loop-runtime-run-20260624024539-deaaef5d.json`
  - iterations:
    `goal-loop-runtime-iteration-20260624024539-7ef2beaf.json` and
    `goal-loop-runtime-iteration-20260624024539-f4cff462.json`
- Runtime result: status `stopped`, completed steps `2/5`, stop reason
  `blocked`, summary `当前 gate 不处于可确认执行状态。`.
- Child gates executed through `planning.scheduler.controlled-advance.run`:
  `planning.scheduler.integration-outcome.reconcile` and
  `planning.scheduler.run.complete`.
- Final visible primary gate: `planning.scheduler.plan.prepare` /
  `准备并行执行计划`, proving the run stopped and exposed the current real next
  gate instead of continuing or re-showing the stale continuation card.
- External source safety: `git -C C:\aho-accept\continue-v1\src status --short`
  returned clean after the smoke.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: browser plugin connection initially had no
  selected tab; reconnecting and opening a fresh tab succeeded. No product
  workaround was required.
- Screenshots / artifacts / run ids: runtime artifacts listed above; snapshot
  evidence saved at `C:\aho-accept\continue-v1\snapshot-after-continuation.json`.
- External source/state safety: external sandbox remained clean after the smoke.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: real UI smoke found the
  bounded continuation gate could exist behind stale primary decision context.
  The fix promotes only matching Scheduler next-action gates and was covered by
  `tests/unit/workbench-goal-loop-surface.test.ts` plus the full Workbench gate.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff only if current handoff docs are
  updated.
- Experience lifecycle result: not applicable unless this change produces
  Harness evolution evidence.
- Roadmap/current-direction stale language check: close/handoff only.
- Old experience retained / merged / retired / archive-only: not applicable.
