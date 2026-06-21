# Project Status

## Current Handoff

- Current date: 2026-06-21.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260621-workbench-verification-signal-stability/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260621-workbench-verification-signal-stability/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260621-auto-evolve-harness-controlled-scheduler-continuation-window/summary.md`.
- Active product phase: none.
- Active Harness evolution phase: none.
- Active close status: none.

This file is the short resume point. No structured change is active. The latest
change stabilized Workbench verification signals by splitting residual scheduler
slow coverage, fixing stale App DOM / controlled-advance test expectations, and
making package script membership explicit. The product baseline remains a full
local Workbench manual-gated path through natural-language demand, planning,
decomposition/readiness, `code.run`, validation/audit/result evidence,
human-confirmed apply, and explicit close/archive.

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

Latest archive:

`harness/changes/archive/20260621-workbench-verification-signal-stability/summary.md`

Next recommended structured work should start from the proven manual baseline
and the now-trustworthy Workbench aggregate signal, not another read-only
evidence layer. Reasonable next slices are:

- reduce the still-expensive scheduler slow-suite runtime without dropping
  scheduler/runtime/source-safety assertions;
- improve a concrete Workbench usability gap found through real use of the
  demand-to-apply/close path;
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
- Latest Harness evolution: `harness/changes/archive/20260621-auto-evolve-harness-controlled-scheduler-continuation-window/summary.md`.
- Controlled Scheduler Post-Step Routing Preflight Handoff: `harness/changes/archive/20260621-controlled-scheduler-post-step-routing-preflight-handoff/summary.md`.
- Workpad Controlled Scheduler Reconfirmation Surface: `harness/changes/archive/20260621-workpad-controlled-scheduler-reconfirmation-surface/summary.md`.

Detailed historical phase narratives are archive-only. Do not copy them back
into this handoff unless they change current agent decisions.
