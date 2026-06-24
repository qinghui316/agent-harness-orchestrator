# workbench-two-tier-scoped-automation-authorization-v1

## Purpose

Implement a two-tier Workbench authorization surface for the current demand:
`请求批准` keeps the existing per-step confirmation behavior, while
`完全访问权限` grants AHO a scoped automation authorization for the selected
`projectId + changeId`. Under that scoped authorization AHO may repeatedly
consume the current authoritative `confirmationQueue.primary` when it is an
allowed local workflow action, revalidate the target, execute one step, reread
fresh evidence, and continue until a blocker, budget limit, unsupported gate,
or high-impact human gate is reached.

The Codex runtime may run with full-access capability. That runtime capability
does not become AHO workflow authority. AHO still enforces scoped target ids,
stale revalidation, ToolPolicyGate audit, source safety, validation/audit, and
human apply/close gates.

## Scope

In scope:

- New scoped automation runtime owner and artifacts.
- New Workbench action `planning.automation.scoped-auto.run`.
- Reusable current-gate revalidation path shared by the server endpoint and
  automation child executor.
- Two-tier Workbench UI/projection for `请求批准` and `完全访问权限`.
- Tests for runtime, action revalidation, Workbench projection, and DOM honesty.

Out of scope:

- Global full-auto mode.
- Multi-worktree parallel executor, whole-wave dispatch, slot allocator, or
  child Change auto creation.
- Automatic source apply, close/archive, merge, remote push/merge, or Harness
  evolution apply.
- New parallel action registry, permission system, projection system, or
  workflow truth.

## Current Status

Ready to close.

Implemented the Workbench two-tier scoped automation authorization V1. The UI
now exposes `请求批准` and `完全访问权限`. `完全访问权限` creates a scoped
automation authorization for the current Change, records Codex runtime
full-access capability as evidence only, and loops over the authoritative
`confirmationQueue.primary` while the current gate is in the V1 allowed local
workflow action set. The runtime stops at unsupported gates, blockers, drift,
budget limit, or human-gated apply/close/merge/remote/Harness evolution gates.

Real UI acceptance initially exposed a product bug: the top-level
`planning.automation.scoped-auto.run` wrote a running workflow action, which
caused the ordinary Workbench projection to hide the current primary gate from
the automation runtime itself. The fix keeps ordinary UI suppression intact but
adds an internal snapshot option used only by the automation child executor, so
it can ignore its own top-level workflow action while still respecting active
execution runs and role-pipeline work.

## Verification

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/web-workflow-actions.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx` passed.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/web-app.test.tsx` passed after the internal snapshot fix.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed; final log: `C:\Users\qinghui\AppData\Local\Temp\aho-test-workbench-two-tier-final.log`.
- Harness checks passed: `lint-ecl`, `lint-encoding`, `harness-change reindex`, `harness-change status`, `harness-evolve check`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first real UI attempt in `C:\aho-accept\two-tier-v2` exposed the internal projection suppression bug above; fixed in product code and rerun in `C:\aho-accept\two-tier-v3`.
- Screenshots / artifacts / run ids: real browser URL `http://127.0.0.1:4333`; external source `C:\aho-accept\two-tier-v3\src`; external runtime home `C:\aho-accept\two-tier-v3\home`; automation authorization `automation-authorization-20260624064345-23fa19a0`; automation run `automation-run-20260624064345-0560e025`; iteration `automation-iteration-20260624064345-1d38b4e9`.
- External source/state safety: source `git status --short` after acceptance contained only Harness initialization artifacts `?? .agent-harness/` and `?? AGENTS.md`; no product diff was applied to the external source root.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: V1 stopped after one completed step at unsupported `planning.decomposition.generate`, leaving the current visible gate for the user. This is expected V1 scope, not a blocker.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for close/handoff. `AGENTS.md` 128 lines, `docs/STATUS.md` 66 lines, `docs/CURRENT-DEVELOPMENT-PLAN.md` 239 lines before close updates. Current docs stayed compact; detailed acceptance history remains in this summary/review.
- Experience lifecycle result: no ECL/template/lint evolution triggered by this change.
- Roadmap/current-direction stale language check: close/handoff updates align active/archived state across `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
