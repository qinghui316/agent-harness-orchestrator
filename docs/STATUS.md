# Project Status

## Current Handoff

- Current date: 2026-06-25.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260624-workbench-scoped-automation-bounded-rework-acceptance-v1/summary.md`.
- Latest real UI continuation scout: `harness/changes/archive/20260624-workbench-real-ui-continuation-next-blocker-scout/summary.md`.
- Latest bounded continuation runtime: `harness/changes/archive/20260624-goal-driven-controlled-continuation-runtime-v1/summary.md`.
- Latest product audit: `harness/changes/archive/20260624-workbench-goal-loop-surface-gap-audit/summary.md`.
- Latest verification convergence: `harness/changes/archive/20260623-workbench-verification-runtime-convergence/summary.md`.
- Latest real-Codex acceptance: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest completed Harness evolution: `harness/changes/archive/20260624-auto-evolve-post-bounded-rework-window/summary.md`.
- Latest scheduler reachability change: `harness/changes/archive/20260625-workbench-low-conflict-taskgraph-scheduler-reachability-v1/summary.md`.

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

The latest Harness evolution handled the five-archive window from
`20260624-auto-evolve-post-continuation-scout-window` through
`20260624-workbench-scoped-automation-bounded-rework-acceptance-v1`. Authorized
subagent review recommends `docs_merge`: compact handoff/current-doc alignment
only, with no ECL/template/lint/product runtime change. It is archived at
`harness/changes/archive/20260624-auto-evolve-post-bounded-rework-window/summary.md`.

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

No pre-existing active change remains.

Latest result:

- Implemented low-conflict TaskGraph readiness for explicit independent source
  scopes.
- Verified raw `planning.scheduler.*` actions are not directly consumed by
  `完全访问权限`.
- Real E-drive UI acceptance reached scheduler preparation, generated Goal Loop
  packet/controller/preflight evidence through scoped automation, entered the
  existing controlled scheduler path, and reached scheduler worker start.
- Final stop: the external acceptance source lacked `node_modules`, so the
  worktree dependency bridge failed closed before Codex code execution. Source
  root stayed clean.

Next recommended work:

- If continuing scheduler execution acceptance, prepare a fresh E-drive sandbox
  with dependencies installed, then test scheduler worker validation/audit and
  integration progression.
- Do not add raw scheduler actions to `完全访问权限`.
- Keep automatic apply/close/merge, remote landing, Harness evolution, and full
  parallel executor out of scope.

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
