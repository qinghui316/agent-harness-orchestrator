# Project Status

## Current Handoff

- Current date: 2026-06-24.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260624-workbench-two-tier-scoped-automation-authorization-v1/summary.md`.
- Latest real UI continuation scout: `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`.
- Latest bounded continuation runtime: `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`.
- Latest product audit: `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`.
- Latest verification convergence: `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`.
- Latest real-Codex acceptance: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260624-auto-evolve-post-continuation-scout-window/summary.md`.

No structured product change is currently active. The latest product change
added the Workbench two-tier authorization surface: `请求批准` preserves
per-step confirmation, while `完全访问权限` creates an AHO-scoped automation
authorization for the selected demand. Codex may run with full-access runtime
capability, but AHO still enforces scoped target ids, stale revalidation,
ToolPolicyGate, source safety, validation/audit, and human apply/close gates.

No pending Harness evolution remains. The latest Harness evolution reviewed the
post-continuation five-archive window with an authorized subagent. Result:
`noop` for ECL rules/templates/lint/product code, plus handoff compression so
detailed sandbox/run histories remain archive-only.

## Current Baseline

The accepted product baseline is a local, manual-gated Workbench loop: ordinary
demand conversation, planning, decomposition/readiness, real `coder-codex`
`code.run`, validation/audit, result review, human-confirmed apply, and
human-confirmed close/archive have all passed real browser acceptance in
external sandboxes.

Bounded continuation V1 is implemented only for matching controlled Scheduler
gates. One explicit Workbench confirmation may run a small step budget and must
stop at blockers, unsupported gates, high-impact human gates, or budget limits.
It is not full-auto, not a parallel executor, and not automatic
apply/merge/close.

Two-tier scoped automation V1 is implemented for the ordinary Workbench
decision surface. A user can keep per-step `请求批准`, or choose
`完全访问权限` once for the current demand. V1 repeatedly consumes the current
authoritative `confirmationQueue.primary` only when the action is in the local
allowed set, and it stops at unsupported gates or high-impact human gates. It
does not auto apply, close, merge, push, or run Harness evolution.

Verification baseline: daily `npm run test:workbench` is the ordinary Workbench
aggregate gate. Heavier full-chain scheduler/apply/Goal Loop coverage is kept
in release/deep package scripts.

## Next Resume Point

No active change is open. Next recommended work:

- If continuing product automation, design the next scoped automation slice
  from the proven two-tier V1 boundary, likely adding the next safe Workbench
  gate family rather than jumping to global full-auto.
- If checking product health first, run a light external-sandbox real UI smoke
  over ordinary demand creation and `完全访问权限` stop behavior.
- Keep automatic apply/close/merge, remote landing, Harness evolution, and
  parallel executor as separate later profiles.

## Verification Commands

Harness/documentation verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Product verification when product code changes:

```powershell
npm run typecheck
npm run lint
npm run test:fast
npm run build
npm run test:integration
npm run test:workbench
```

## Archive Lookup

Use `harness/changes/INDEX.json` for the generated archive list. Start with
archived `summary.md` files; open specs, plans, reviews, or source only when the
current task needs that evidence.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
