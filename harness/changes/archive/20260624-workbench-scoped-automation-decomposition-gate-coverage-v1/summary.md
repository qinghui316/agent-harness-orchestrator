# workbench-scoped-automation-decomposition-gate-coverage-v1

## Purpose

Extend the proven Workbench two-tier scoped automation path to cover the
existing decomposition proposal gate. The previous `完全访问权限` V1 real UI
acceptance advanced `planning.confirm-execution` and then correctly stopped at
the next unsupported decomposition-generation gate. The implemented action id
for that gate is `planning.decompose`.

This change makes `planning.decompose` eligible for scoped automation only when
it is the current authoritative Workbench primary confirmation, with current
gate revalidation and stale-target failure preserved.

## Scope

In scope:

- Add `planning.decompose` to scoped automation allowed local workflow actions.
- Add target/revalidation coverage for `planning.decompose`.
- Cover automation, action revalidation, read-model, and DOM payload behavior.
- Run a real external-sandbox UI acceptance showing one `完全访问权限`
  confirmation advances past decomposition proposal generation.

Out of scope:

- Planning draft generation automation.
- Automatic apply, close/archive, merge, remote landing, or Harness evolution.
- Full-auto task mode, scheduler loop, parallel executor, slot allocator, or
  child Change auto creation.
- New action registry, permission system, projection system, or evidence
  family.

## Current Status

Ready to close.

`planning.decompose` is now covered by scoped automation only through the
authoritative current Workbench primary gate. The implementation reuses the
existing scoped automation allow-list, workflow action required-target checks,
current action revalidation, and Workbench UI payload path. No new permission
system, projection system, evidence family, full-auto mode, scheduler loop, or
parallel executor was added.

## Verification

Passed:

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-planning-scheduler-prep.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run test:workbench`
- `npm run build`

During verification, `npm run test:workbench` first exposed a real fixture
gap: `workbench-planning-scheduler-prep.test.ts` was directly calling
`planning.decompose` without first confirming the current
`planning.confirm-execution` gate. With `planning.decompose` now revalidated,
that shortcut correctly failed closed. The fixture was updated to follow the
real Workbench action order before decomposition.

## Acceptance Feedback

External real UI smoke used:

- Source: `C:\aho-accept\decompose-gate-v1\src`
- Runtime home: `C:\aho-accept\decompose-gate-v1\home`
- Workbench URL: `http://127.0.0.1:4338/`
- Demand/change id: `aho-scoped-automation-decomposition-gat`

Observed UI/action path:

1. Browser UI created a normal Workbench demand.
2. `planning.generate` showed `完全访问权限` disabled, as expected.
3. After real `codex-readonly` planning draft completion, UI showed
   `planning.confirm-execution` with `完全访问权限` enabled.
4. One `完全访问权限` confirmation advanced through canonical planning and
   generated `DecompositionPlan drafted`, proving the newly covered
   `planning.decompose` gate was consumed through the real UI/action path.
5. The scoped automation continued through already allowed local gates to real
   `coder-codex`, validation, and audit, then stopped at the audit acceptance
   human gate.

Acceptance run artifacts:

- Intake scan: `run-20260624-154857-aho-scoped-automation-decomposition-gat-35bcc7`
- Planning draft: `run-20260624-154927-aho-scoped-automation-decomposition-gat-2a333a`, runtime `codex-readonly`, status `completed`
- Code run: `run-20260624-155226-aho-scoped-automation-decomposition-gat-b9ca2c`, runtime `coder-codex`, executionMode `worktree`, status `completed`
- Validation: `run-20260624-155341-aho-scoped-automation-decomposition-gat-ec286c`, status `completed`
- Audit: `run-20260624-155344-aho-scoped-automation-decomposition-gat-3e7eb7`, status `completed`

API snapshot after automation stopped at:

- `confirmationQueue.primary.kind = request-changes`
- `primarySummary = Audit proposal can be accepted: run-20260624-155344-aho-scoped-automation-decomposition-gat-3e7eb7`
- `runtimeStatus = waiting-decision`
- `userStatus = waiting-confirmation`

Source safety evidence:

- External source `git status --short` after the smoke showed only harness
  initialization files: `?? .agent-harness/`, `?? AGENTS.md`.
- The `coder-codex` run recorded source root unchanged before/after; the code
  diff remained in worktree `wt-20260624-155226-9faede`.

Observed non-blocking follow-up:

- Reloading the browser after the smoke returned the app to an unselected /
  not-ready project shell until the project list was refreshed/reselected. The
  API snapshot remained correct. This is recorded as a separate UI state
  restoration polish item, not a blocker for the decomposition gate coverage.

No remote handoff, apply, close/archive, or Harness evolution was attempted.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff only.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: close/handoff only.
- Old experience retained / merged / retired / archive-only: not applicable.
