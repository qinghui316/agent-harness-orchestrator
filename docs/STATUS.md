# Project Status

## Current Handoff

- Current date: 2026-06-23.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260623-workbench-real-ui-next-blocker-scout/summary.md`.
- Latest archived projection fix: `harness/changes/archive/20260623-workbench-close-gate-projection-alignment/summary.md`.
- Latest real-Codex acceptance change: `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260623-document-goal-driven-workflow-loop-target/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260623-auto-evolve-harness-real-codex-acceptance-window/summary.md`.
- Active product phase: post real-Codex manual loop acceptance with clarified Goal-driven Workflow Loop target.
- Active Harness evolution phase: none.

This file is the short resume point. No structured product or Harness evolution
change is active. The latest product change archived at
`harness/changes/archive/20260623-workbench-real-ui-next-blocker-scout/summary.md`
used external sandbox `C:\aho-accept\next2` to run a real browser UI scout over
the proven manual-gated local Workbench loop. It reached real UI planning,
decomposition/readiness, real `coder-codex` `code.run`, validation pass, audit
approval, visible UI `audit.accept`, human-gated `result.apply` with local
commit, and human-confirmed close/archive. It fixed two product blockers:
active foreground validator tasks now suppress premature result-review
decisions, and selected archived demands no longer expose landing context as
the current primary confirmation. The prior projection fix archived at
`harness/changes/archive/20260623-workbench-close-gate-projection-alignment/summary.md`
fixed the bounded Workbench projection gap where the Decision Inspector could
lag behind the authoritative confirmation queue after committed apply and
landing refresh. The latest docs convergence change archived at
`harness/changes/archive/20260623-document-goal-driven-workflow-loop-target/summary.md`
clarified the future Goal-driven Workflow Loop target: the main Agent loops over current
Goal/Change evidence and chooses read-only planning, sequential work,
low-conflict parallel worktree slices, validation/audit, bounded rework,
IntegrationFix, waiting, or user clarification while high-impact gates remain
human confirmed. The archive-threshold Harness evolution window has been
handled and archived at
`harness/changes/archive/20260623-auto-evolve-harness-real-codex-acceptance-window/summary.md`.
The real Workbench/Codex acceptance on the current AHO repository is archived.
External sandbox `a10` reached scoped planning, decomposition/readiness, real
`coder-codex` worktree `code.run`, validation failure, bounded rework,
validation pass, audit `approved`, visible UI `audit.accept`, human-gated
`result.apply` with local commit, landing readiness refresh, and
human-confirmed close/archive. No fake Codex, fixture result, hand-written run
artifact, remote PR, push, or merge was used. Resolved blockers include Codex
startup config, isolated worktree dependency setup, stale `web-app.test.tsx`
run-graph signal, same-root source pollution, duplicate in-flight primary
actions, missing local committed-apply close path, and committed-apply landing
attribution.

The follow-up projection issue from that acceptance has been handled: when a
selected demand has a real `change.close` approval, both
`confirmationQueue.primary` and `decisionInspector.primary` now project the
close gate, while stale failure/result context remains related or historical
evidence.

## Current Baseline

The product has mature evidence and boundary layers for Workbench conversations,
role execution, validation/audit, result review, apply readiness, controlled
Scheduler continuation, Goal Loop guidance, maintenance evidence, and Harness
evolution. The latest Workbench golden-flow acceptance proved that the main
surface can carry one local demand from ordinary user request through planning,
decomposition/readiness, readiness-scoped `code.run`, validation/audit evidence,
result review, human-confirmed apply, and a separate human-confirmed
close/archive gate.

The controlled Scheduler acceptance also proved that one confirmed
`planning.scheduler.controlled-advance.run` can execute one existing Scheduler
gate, stop, refresh evidence, prepare the next preflight, and allow another
human-confirmed step.

That controlled Scheduler path remains useful boundary work, but it is not the
same as product usability. Goal Loop, Scheduler, readiness, summary, decision,
handoff, and prompt-context artifacts remain evidence/projection layers unless a
later accepted change promotes a specific runtime authority. Human confirmation
is still required for high-impact source apply, close/archive, remote landing,
and Harness evolution.

## Next Resume Point

Latest docs convergence archive:

`harness/changes/archive/20260623-document-goal-driven-workflow-loop-target/summary.md`

Latest product projection fix archive:

`harness/changes/archive/20260623-workbench-close-gate-projection-alignment/summary.md`

Latest real UI scout archive:

`harness/changes/archive/20260623-workbench-real-ui-next-blocker-scout/summary.md`

Latest real-Codex product acceptance archive:

`harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`

Pending Harness evolution:

None. The archive-threshold pending window has been handled and archived at
`harness/changes/archive/20260623-auto-evolve-harness-real-codex-acceptance-window/summary.md`.

Reasonable later product slices are:

- next recommended: reduce the still-expensive scheduler slow-suite runtime
  without dropping
  scheduler/runtime/source-safety assertions;
- evaluate full-auto task mode as a separate scoped-authorization design only
  after reusing the proven manual gates and source safety;
- if a new product blocker appears, fix that blocker before expanding
  automation.

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
# Start with the smallest command set that covers the touched boundary, then
# escalate when shared runtime or aggregate workflow behavior is affected.
npm run typecheck
npm run lint
npm run test:fast
npm run build
npm run test:integration
npm run test:workbench
```

Use `test:fast` for broad non-Workbench unit coverage, `test:integration` for
CLI/integration-style behavior, `test:workbench` for the aggregate Workbench
contract, and selected slow Workbench suites when the touched flow requires
them. Full `npm run test` remains the release/broad-risk gate.

## Archive Lookup

Use `harness/changes/INDEX.json` for the generated archive list. Start with
archived `summary.md` files; open specs, plans, reviews, or source only when the
current task needs that evidence.

Recent relevant archive summaries:

- Workbench Verification Signal Stability: `harness/changes/archive/20260621-workbench-verification-signal-stability/summary.md`.
- Workbench Demand To Execution Golden Flow: `harness/changes/archive/20260621-workbench-demand-to-execution-golden-flow/summary.md`.
- Workbench Usable Manual Closed Loop: `harness/changes/archive/20260621-workbench-usable-manual-closed-loop/summary.md`.
- Controlled Scheduler Continuation Acceptance: `harness/changes/archive/20260621-controlled-scheduler-continuation-acceptance/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260623-auto-evolve-harness-real-codex-acceptance-window/summary.md`.
- Controlled Scheduler Post-Step Routing Preflight Handoff: `harness/changes/archive/20260621-controlled-scheduler-post-step-routing-preflight-handoff/summary.md`.
- Workpad Controlled Scheduler Reconfirmation Surface: `harness/changes/archive/20260621-workpad-controlled-scheduler-reconfirmation-surface/summary.md`.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
