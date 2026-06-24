# Review: workbench-scoped-automation-decomposition-gate-coverage-v1

Status: approved.

## Findings

No blocking findings.

## Verification

Passed:

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-planning-scheduler-prep.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run test:workbench`
- `npm run build`

`npm run test:workbench` completed successfully after the planning/scheduler
prep fixture was corrected to follow the real gate order
`planning.confirm-execution -> planning.decompose`. The earlier aggregate
failure was a test-fixture shortcut exposed by stricter revalidation, not a
product regression.

## Scoped Workbench Action Payload Coverage

Applicable and covered.

- `planning.decompose` now has required target validation for `changeId`.
- `planning.decompose` is included in revalidated workflow actions.
- Scoped automation payloads carry `changeId`,
  `automationCurrentGateActionType`, `automationMode`, and `maxSteps`.
- Missing, disabled, stale, forged, or cross-Change current gates fail closed
  through current action revalidation.

Tested with `workflow-actions.test.ts`, `automation-runtime.test.ts`, and
`action-revalidation.test.ts`.

## Workbench User-Surface Honesty Coverage

Applicable and covered.

- `请求批准` remains the default.
- `完全访问权限` is available only on allowed current workflow gates.
- `planning.generate` remained outside scoped automation in the real UI smoke.
- Running automation suppresses duplicate primary confirmation through the
  existing running-action surface.
- UI tests check that no fake full-auto, parallel executor, or merge queue copy
  appears.

Tested with `web-app.test.tsx` and external browser UI smoke.

## Read Model Projection Coverage

Applicable and covered.

- Workbench read-model tests still pass with scoped automation and current
  primary confirmation behavior.
- API snapshot after real automation showed the authoritative primary stopped
  at an audit acceptance gate, not a stale decomposition/planning gate.

Tested with `workbench-read-model.test.ts` and `npm run test:workbench`.

## Runtime Bridge Boundary Coverage

Applicable and covered.

The real UI smoke reached a real `coder-codex` worktree run after one scoped
authorization:

- Planning draft: `run-20260624-154927-aho-scoped-automation-decomposition-gat-2a333a`, runtime `codex-readonly`
- Code run: `run-20260624-155226-aho-scoped-automation-decomposition-gat-b9ca2c`, runtime `coder-codex`, executionMode `worktree`
- Validation: `run-20260624-155341-aho-scoped-automation-decomposition-gat-ec286c`
- Audit: `run-20260624-155344-aho-scoped-automation-decomposition-gat-3e7eb7`

The smoke stopped at the audit acceptance human gate. It did not auto-apply,
auto-close, push, merge, or run Harness evolution.

## Source Apply Safety Coverage

Applicable and covered by negative evidence.

The external source root was not modified by `code.run`; the code diff stayed
inside worktree `wt-20260624-155226-9faede`. External source
`git status --short` after the smoke showed only harness initialization files:

- `?? .agent-harness/`
- `?? AGENTS.md`

No source apply, close/archive, remote action, or Harness evolution was
attempted.

## Module Boundary Coverage

Applicable and covered.

The change reused existing owners:

- Scoped automation policy: `src/automation-runtime/policy.ts`
- Required targets and revalidated action membership:
  `src/workflow-actions/registry.ts`
- Current-gate revalidation:
  `src/workbench/actions/current-action-revalidation.ts`
- UI allow-list:
  `src/web/src/panels/workbench/DecisionPanels.tsx`

No new action registry, permission system, projection system, evidence family,
or broad facade owner was introduced.

## Core Mechanism Reuse Coverage

Applicable and covered.

This is a small product capability extension over the already implemented
two-tier scoped automation path. It strengthens the shared revalidation path
instead of creating a decomposition-specific executor or permission branch.

## Acceptance Feedback

Real browser UI acceptance used external sandbox:

- Source: `C:\aho-accept\decompose-gate-v1\src`
- Runtime home: `C:\aho-accept\decompose-gate-v1\home`
- URL: `http://127.0.0.1:4338/`
- Demand/change id: `aho-scoped-automation-decomposition-gat`

Observed sequence:

1. UI-created demand.
2. `planning.generate` required ordinary single-step confirmation; full access
   was disabled.
3. Real `codex-readonly` planning completed.
4. One UI `完全访问权限` confirmation advanced past the newly supported
   `planning.decompose` gate and displayed `DecompositionPlan drafted`.
5. Automation continued through allowed local gates to real `coder-codex`,
   validation, and audit, then stopped at human audit acceptance.

Observed follow-up: reloading the browser after the smoke returned the front
end to an unselected/not-ready project shell until project refresh/reselection,
while the API snapshot remained correct. This is a UI state restoration polish
item outside this change's acceptance boundary.
