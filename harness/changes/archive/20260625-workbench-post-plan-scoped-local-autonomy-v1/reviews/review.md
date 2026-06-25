# Review: workbench-post-plan-scoped-local-autonomy-v1

Status: completed.

## Findings

No blocking findings.

Implemented fix note: real UI retry `v1b` exposed that `change.close` could move
the managed Change to archive while the automation runtime still finalized run
records against the original active path. That recreated an active directory and
left stale approval projection evidence. The fix belongs in
`src/automation-runtime/repository.ts`: if an active change path no longer
exists, automation records for the same `changeId` resolve to the archived
Change path and update artifact refs there.

## Verification

- Selected verification scope: automation runtime, approval/current-gate
  revalidation, Workbench read-model, DOM authorization surface, project checks,
  Workbench aggregate, and real E-drive UI acceptance.
- Targeted suites:
  - `npx vitest run tests/unit/automation-runtime.test.ts`
  - `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
- Required checks:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
  - `npm run test:workbench`
- Aggregate timeout result: none. `npm run test:workbench` passed.

## Complexity Deletion Review

- delete: no dead runtime path found.
- reuse: existing `automation-runtime`, `current-action-revalidation`,
  Workbench approval handlers, apply/close handlers, source safety, read-model
  approval/decision projections, and `DecisionPanels`.
- yagni: no new workflow runtime, permission system, projection framework,
  evidence family, scheduler executor, child Change, or Harness evolution
  automation.
- shrink: fixed post-close artifact placement in the repository owner instead
  of adding close-specific runner bookkeeping.
- net: small positive increase for explicit local apply/close support and a
  regression test; no parallel framework added.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Checked surface: real browser UI on
  `http://127.0.0.1:4333/` with source
  `E:\aho-accept\scoped-local-autonomy-v1c\src`.
- Plan confirmation: `完全访问权限` was absent before
  `planning.confirm-execution`; only manual confirmation was available.
- Post-plan execution: `完全访问权限` became available after accepted plan
  artifacts and one confirmation started automation.
- Running state: while automation ran, repeated primary confirmation was
  disabled and the composer showed a stop control.
- Final state: the selected demand showed archived/completed state with no
  active confirmation queue item.
- Forbidden surface check: no full-auto, parallel executor, merge queue,
  remote, PR, or Harness evolution automation was shown as available.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked actions: `planning.automation.scoped-auto.run`, `audit.accept`,
  `result.apply`, and `change.close`.
- Target ids: automation request remained bound to selected `changeId`;
  approval child gates revalidated current approval ids, run/worktree/change
  targets, and action ids.
- Fail-closed tests cover stale, cross-change, missing/forged apply/close
  targets and unsupported raw scheduler / integration apply-discard /
  remote/Harness gates.
- The child executor preserves approval `options`, so local apply keeps the
  existing commit behavior and close can run after apply.

## Source Apply Safety Coverage

- Applicable: yes.
- Source project: `E:\aho-accept\scoped-local-autonomy-v1c\src`.
- Runtime home: `E:\aho-accept\scoped-local-autonomy-v1c\home`.
- Source-root mutation gate: source was not modified before local apply; apply
  ran through existing `worktree-apply` handler and source safety checks.
- After apply: source `git status --short` was empty and HEAD was
  `03653c7 Apply AHO result: src-message-js-greeting-hello-from-scoped-local-auto`.
- Out-of-scope mutations: no remote, merge, PR, integration apply/discard, raw
  scheduler, or Harness evolution operation ran.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Runtime bridge: real `coder-codex` run
  `run-20260625-152813-src-message-js-greeting-hello-from-scoped-local-auto-4fd371`
  used `executionMode: worktree`.
- Apply bridge: `worktree-apply` run
  `run-20260625-153004-src-message-js-greeting-hello-from-scoped-local-auto-e58f75`
  applied the diff to the source root through the existing apply path.
- Automation run:
  `automation-run-20260625072811-0eab438b`, `completedSteps: 7`,
  `stopReason: no-primary-gate`.
- Boundary result: Codex full-access runtime capability did not expand AHO
  authority beyond the selected Change and the allowed local gate set.

## Module Boundary Coverage

- Applicable: yes.
- Owners touched:
  - `src/automation-runtime/` for policy, run/iteration persistence, and run
    metadata.
  - `src/workbench/actions/current-action-revalidation.ts` for reusable
    current approval revalidation.
  - `src/workbench/actions/handlers/automation.ts` for scoped automation child
    dispatch.
  - Workbench read-model approval/decision owners for UI eligibility.
  - `src/web/src/panels/workbench/DecisionPanels.tsx` for the two-tier surface.
- Main logic was not added to broad Workbench facades or server route files.
- Compatibility: manual per-step approvals remain valid.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Reused mechanisms: authoritative `confirmationQueue.primary`, existing
  approval action payloads, current-gate revalidation, apply/close handlers,
  source state checks, accepted artifact hash checks, ToolPolicy/human-gate
  evidence, and existing Workbench running-state suppression.
- New mechanism justification: none. No new core mechanism was added.
- Future-cost result: local terminal gate automation now uses the same current
  gate / approval revalidation pattern as existing safe approval automation.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked/updated: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, and narrow high-impact gate wording in
  `docs/ECL.md`.
- Stale wording checked: old current-state language saying scoped full access
  stops at human `result.apply` was removed from current docs.
- Latest archive alignment: to be completed by `harness-change close`.
- Pending evolution state: none.

## Remote Handoff Acceptance Coverage

- Applicable: no.
- Reason: change does not affect Draft PR, remote checks/reviews, remote merge,
  push, or remote landing.
