# Project Status

## Current Handoff

- Current date: 2026-06-24.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`.
- Latest bounded continuation runtime: `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`.
- Latest product audit: `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`.
- Latest verification convergence: `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`.
- Latest real-Codex acceptance: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260624-auto-evolve-post-continuation-scout-window/summary.md`.

No active change or pending Harness evolution remains. The latest Harness
evolution reviewed the post-continuation five-archive window with an authorized
subagent. Result: `noop` for ECL rules/templates/lint/product code, plus
handoff compression so detailed sandbox/run histories remain archive-only.

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

Verification baseline: daily `npm run test:workbench` is the ordinary Workbench
aggregate gate. Heavier full-chain scheduler/apply/Goal Loop coverage is kept
in release/deep package scripts.

## Next Resume Point

Latest Harness evolution archive:

`harness/changes/archive/20260624-auto-evolve-post-continuation-scout-window/summary.md`

Next product slice can either design scoped full-auto / wider Goal-driven loop
authorization from the proven manual gates, or continue real UI use to find the
next concrete Workbench blocker.

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
