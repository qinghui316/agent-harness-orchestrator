# workbench-post-plan-scoped-local-autonomy-v1

## Purpose

Extend Workbench scoped `full access` automation from post-plan execution up to
the local apply and close gates. Plan confirmation remains human-only; after an
accepted plan, full-access authorization may complete the current Change's
local loop when existing source-safety, stale-target, validation, audit, apply,
and close guards all pass.

This change only widens the existing Workbench automation runtime. It does not
create a new workflow runtime, scheduler executor, permission system, evidence
family, or Harness evolution automation.

## Scope

In scope:

- Allow scoped automation to consume local `result.apply` after existing apply
  readiness and source-safety revalidation pass.
- Allow scoped automation to consume local `change.close` after the existing
  close gate is current and scoped to the same Change.
- Preserve human-only plan confirmation and external/high-impact boundaries.
- Add targeted tests and real E-drive UI acceptance for a full local loop.

Out of scope:

- Automating `planning.confirm-execution`.
- Automating raw `planning.scheduler.*`, integration apply/discard, remote
  push/merge/PR, or Harness evolution.
- Adding a new workflow runtime, permission system, projection framework,
  evidence family, scheduler loop, slot allocator, child Change, or parallel
  executor.

## Current Status

Completed / Ready to close.

Scoped `完全访问权限` now remains unavailable for
`planning.confirm-execution`, but after human plan confirmation it may consume
the current selected-Change local execution gates through existing
revalidation/handler paths, including safe `audit.accept`, local
`result.apply`, and local `change.close`.

## Verification

Passed:

- `npx vitest run tests/unit/automation-runtime.test.ts`
- `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`

Real UI acceptance passed on E-drive:

- Source: `E:\aho-accept\scoped-local-autonomy-v1c\src`
- Runtime home: `E:\aho-accept\scoped-local-autonomy-v1c\home`
- Workbench URL: `http://127.0.0.1:4333/`
- Plan confirmation stage: no `完全访问权限` option was shown.
- Post-plan stage: one `完全访问权限` authorization ran local execution,
  validation, audit, `audit.accept`, `result.apply`, and `change.close`.
- Automation run:
  `automation-run-20260625072811-0eab438b`, `completedSteps: 7`,
  `stopReason: no-primary-gate`,
  `stopSummary: Local close completed; no further local automation gate remains.`
- Codex run:
  `run-20260625-152813-src-message-js-greeting-hello-from-scoped-local-auto-4fd371`
  with `runtime: coder-codex` and `executionMode: worktree`.
- Apply run:
  `run-20260625-153004-src-message-js-greeting-hello-from-scoped-local-auto-e58f75`
  with `runtime: worktree-apply`.
- Source before apply was clean; after automation, `git status --short` was
  empty and HEAD was `03653c7 Apply AHO result:
  src-message-js-greeting-hello-from-scoped-local-auto`.
- Archived managed Change:
  `E:\aho-accept\scoped-local-autonomy-v1c\home\projects\src\harness\changes\archive\20260625-src-message-js-greeting-hello-from-scoped-local-auto`.
- Active managed Change directory was not recreated after close; only `.gitkeep`
  remained under the managed memory active directory.
- No remote, merge, PR, integration apply/discard, raw scheduler action, or
  Harness evolution action ran automatically.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: the first E-drive retry (`v1b`) exposed that
  close could archive the managed Change and then automation-run finalization
  would recreate the active change path. The fix moved post-close automation
  record writes to the archived Change path.
- Screenshots / artifacts / run ids: see Verification section.
- External source/state safety: `E:\aho-accept\scoped-local-autonomy-v1c\src`
  stayed clean before apply and after the automated local apply commit.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: fixed in
  `src/automation-runtime/repository.ts` and covered by
  `does not recreate the active change after close archives it`.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: handoff docs updated only for current baseline.
- Experience lifecycle result: previous "stops at result.apply" baseline is
  retired from current handoff docs and remains archive-only.
- Roadmap/current-direction stale language check: updated `AGENTS.md`,
  `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and the narrow ECL
  high-impact gate wording for scoped local authorization.
- Old experience retained / merged / retired / archive-only: retired current
  wording that said full access always stops at human `result.apply`.

