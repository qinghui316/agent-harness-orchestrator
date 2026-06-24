# Project Status

## Current Handoff

- Current date: 2026-06-24.
- Active ECL change: none.
- Pending Harness evolution: `harness/evolution/pending.md`.
- Latest archived product change: `harness/changes/archive/20260624-workbench-scoped-automation-bounded-rework-acceptance-v1/summary.md`.
- Latest real UI continuation scout: `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`.
- Latest bounded continuation runtime: `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`.
- Latest product audit: `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`.
- Latest verification convergence: `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`.
- Latest real-Codex acceptance: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest completed Harness evolution: `harness/changes/archive/20260624-auto-evolve-post-continuation-scout-window/summary.md`.

The latest product change is archived at
`harness/changes/archive/20260624-workbench-scoped-automation-bounded-rework-acceptance-v1/summary.md`.
It extends the Workbench two-tier authorization surface so `完全访问权限` can
consume local bounded recovery gates (`result.refresh-rework`,
`result.revalidate`, `result.reaudit`) only when one of them is the current
authoritative primary confirmation for the selected demand. When the resulting
audit is exactly `approved`, it can also consume safe `audit.accept` and then
stops at the human `result.apply` gate. Codex may run with full-access runtime
capability, but AHO still enforces scoped target ids, stale revalidation,
ToolPolicyGate, source safety, validation/audit, and human apply/close gates.

A new Harness evolution window is pending after the bounded-rework acceptance
archive. It covers the five-archive window from
`20260624-auto-evolve-post-continuation-scout-window` through
`20260624-workbench-scoped-automation-bounded-rework-acceptance-v1`. Do not
auto-apply it; handle it through proposal, independent review, validation,
`results.tsv`, and `harness-evolve mark-complete`.

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
can now automatically run bounded local recovery gates, automatically accept
safe approved audit evidence through `audit.accept`, and then stops at
`result.apply`. It does not auto apply, close, merge, push, or run Harness
evolution.

Verification baseline: daily `npm run test:workbench` is the fast Workbench
unit-capability gate. Heavier full-chain scheduler/apply/Goal Loop coverage is
kept in `npm run test:workbench:release` and other explicit slow/deep package
scripts.

## Next Resume Point

No active change is open. Next recommended work:

- First handle `harness/evolution/pending.md` if continuing Harness
  maintenance.
- If continuing product capability, design the next scoped automation profile
  or broader Goal-driven loop slice from the proven human gates.
- If improving verification cost, target remaining Workbench aggregate/runtime
  topology debt without moving deep/release paths back into the daily gate.
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
npm run test:workbench:release
```

## Archive Lookup

Use `harness/changes/INDEX.json` for the generated archive list. Start with
archived `summary.md` files; open specs, plans, reviews, or source only when the
current task needs that evidence.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
