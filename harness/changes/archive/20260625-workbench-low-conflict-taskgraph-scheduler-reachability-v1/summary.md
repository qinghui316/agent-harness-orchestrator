# workbench-low-conflict-taskgraph-scheduler-reachability-v1

## Purpose

Make the Workbench ordinary demand path able to reach the existing controlled scheduler execution strategy when the accepted TaskGraph is clearly low-conflict. The product should recognize explicit, non-overlapping task source scopes after manual plan confirmation, expose only the existing bounded Goal Loop controlled continuation surface, and avoid presenting raw scheduler internals as a new full parallel executor.

## Scope

In scope:

- Strengthen decomposition/readiness so scheduler readiness is available only for confirmed low-conflict TaskGraph candidates with explicit source scopes and no ambiguous dependencies.
- Keep `完全访问权限` scoped to the existing automation allowed set and `planning.goal-loop.controlled-continue.run`; do not directly allow raw `planning.scheduler.*` actions.
- Align Workbench projection/UI wording for the supported controlled scheduler path without advertising full parallel execution.
- Add targeted planning/readiness, automation policy, projection, and DOM coverage plus real UI evidence when feasible.

Out of scope:

- Full parallel executor, simultaneous wave dispatch, slot allocator, raw scheduler action automation, child Change creation, automatic apply/close/merge/remote/Harness evolution.
- Replacing existing scheduler handlers, IntegrationCheck, ToolPolicyGate, current-gate revalidation, or AutomationRuntime with a new framework.

## Current Status

Completed. Ready to close.

Implemented low-conflict TaskGraph readiness, Workbench user-surface copy
hardening, and the controlled-continuation surface bridge. Mechanical
verification is passing. Real E-drive UI acceptance proved the ordinary demand
can reach low-conflict scheduler preparation, generate fresh Goal Loop
packet/controller/preflight evidence through scoped automation, enter the
existing controlled scheduler path, and stop at a real downstream gate/blocker.

The final real UI run stopped after a scheduler worker attempt because the
external sandbox source root lacked `node_modules`, so the worktree dependency
bridge failed closed before Codex could write code. That is classified as an
environment/dependency setup blocker for the acceptance sandbox, not as a
failure of low-conflict TaskGraph scheduler reachability.

## Verification

- PASS: `npx vitest run tests/unit/workbench-planning-scheduler-prep.test.ts tests/unit/automation-runtime.test.ts tests/unit/web-app.test.tsx`
  - 3 files, 67 tests.
- PASS: `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx`
  - 3 files, 84 tests.
- PASS: `npx vitest run tests/unit/action-revalidation.test.ts tests/unit/workflow-actions.test.ts`
  - 2 files, 25 tests.
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run build`.
- PASS: `npm run test:fast`.
  - 49 files, 523 tests. First aggregate attempt hit the known DOM aggregate-only flake in `web-app.test.tsx`; single-file rerun passed, and aggregate rerun passed.
- PASS: `npm run test:workbench`.
  - 9 files, 121 tests.
- Harness checks will be run in the close pass after handoff docs are updated.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits:
  - External AHO runtime state was kept on E drive:
    `E:\aho-accept\taskgraph-scheduler-v1b\home`.
  - Source project was kept on E drive:
    `E:\aho-accept\taskgraph-scheduler-v1b\src`.
  - Codex authentication used the existing default Codex config under the user
    profile; an earlier attempt with an isolated E-drive `CODEX_HOME` failed
    with 401 because that home had no auth. No AHO source/runtime acceptance
    directory was left on C drive for the successful run.
- Extra prompts or reviewer instructions:
  - Demand text used explicit low-conflict scopes:
    `请并行独立修改 src/alpha.ts 和 src/beta.ts：分别新增 alphaLabel 和 betaLabel 导出，并保持两个文件互不依赖。`
- Retries or environment failures:
  - First E-drive attempt used isolated Codex home and failed at real
    `codex-readonly` planning with 401 Unauthorized.
  - Fresh E-drive run with default authenticated Codex config completed the
    planning stage.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4330/`.
  - UI snapshot: `E:\aho-accept\taskgraph-scheduler-v1b\ui-snapshot-final.json`.
  - Planning run id:
    `run-20260625-002142-src-alpha-ts-src-beta-ts-alphalabel-betalab-da9e6f`.
  - Latest planning bundle:
    `E:\aho-accept\taskgraph-scheduler-v1b\home\projects\taskgraph-scheduler-v1b\harness\changes\active\src-alpha-ts-src-beta-ts-alphalabel-betalab\planning\latest-bundle.json`.
  - The bundle contained T-001 scoped to `src/alpha.ts` and T-002 scoped to
    `src/beta.ts`.
  - Follow-up Workbench URL after rebuild/restart: `http://127.0.0.1:4334/`.
  - Post-fix UI snapshot:
    `E:\aho-accept\taskgraph-scheduler-v1b\ui-snapshot-after-fix.json`.
  - Automation run:
    `automation-run-20260624170747-a270a279`, status `stopped`, completed
    steps `2`, stop reason `unsupported-gate`.
  - Goal Loop evidence generated by full-access scoped automation:
    `goal-loop-next-step-packet-20260624170352-8bb78468`,
    `goal-loop-controller-policy-20260624170355-2b54fda3`, and
    `goal-loop-gate-readiness-preflight-20260624170753-2142a5e8`.
  - Controlled scheduler evidence:
    `scheduler-controlled-step-20260624170755-899c7576`,
    `scheduler-worker-start-20260624170748-2500990f`, and
    `scheduler-worker-result-46ece4dc`.
  - Worker run:
    `run-20260625-010748-src-alpha-ts-src-beta-ts-alphalabel-betalab-e0432d`,
    runtime `coder-codex`, execution mode `worktree`, status `failed`.
- External source/state safety:
  - Before real UI scheduler preparation, external source status was clean.
  - After reaching the scheduler preparation/launch-direction gate, external
    source status remained clean; no source-root mutation occurred.
  - After full-access controlled scheduler reachability, external source status
    remained clean; no source-root mutation occurred.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  - PASS: ordinary Workbench demand reached two-task planning,
    decomposition/readiness, and scheduler preparation/launch-direction gates.
  - PASS: raw `planning.scheduler.*` gates are not directly eligible for
    `完全访问权限`; automation allowlist still only permits the scheduler path
    through `planning.goal-loop.controlled-continue.run`.
  - FIXED: primary scheduler preparation/launch copy no longer exposes
    `SchedulerContract`, `dry-run`, `WorkerLease`, raw worker labels, or
    full-parallel-executor claims as the user-facing flow.
  - FIXED: supported scheduler gates now expose a safe Goal Loop preparation
    action, and scoped automation prioritizes `gate-readiness.prepare` /
    controlled-continuation evidence over older controller refresh actions.
  - PASS: `完全访问权限` did not directly consume raw `planning.scheduler.*` or
    `planning.scheduler.controlled-advance.run`; it consumed Goal Loop
    preparation and then the existing controlled scheduler path.
  - FINAL STOP: the scheduler worker run failed before code execution because
    the E-drive acceptance source root did not have `node_modules`. The failure
    text was: `Cannot prepare worktree dependency bridge: source dependencies
    are missing at E:\aho-accept\taskgraph-scheduler-v1b\src\node_modules.`

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff docs updated to archive-only
  detailed run history and current baseline pointers.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: pending close/handoff.
- Old experience retained / merged / retired / archive-only: not applicable.
