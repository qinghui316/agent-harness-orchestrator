# Project Status

## Current Handoff

- Current date: 2026-06-18.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260618-phase-12i-status-handoff-entropy-cleanup/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260618-phase-12a-controlled-scheduler-loop-design-boundary/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12c-12g-controlled-loop-context-evidence/summary.md`.
- Active product phase: none. Active Harness evolution phase: none.
- Active close status: no active change.

This file is the short resume point. Phase 12I is archived after restoring `docs/STATUS.md` to a compact handoff while preserving current state, latest archive paths, the Phase 12H baseline, next recommended work, verification commands, and archive lookup guidance.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`. Historical detail belongs in archived summaries and `harness/changes/INDEX.json`.

## Current Baseline

The product baseline is post-Phase-12H. Goal Loop controlled-loop state is still non-executing evidence only. Fresh Workpad-visible main-Agent context can add `goal-loop-controlled-loop-state` to actual `chat.ask` / `orchestrator.plan` `run.json.promptStack` and compact `goalLoopControlledLoopState` refs to `context.prepared`; stale or hidden Goal Loop context omits those labels/refs.

The scheduler-loop snapshot and controlled-loop state remain absent from iteration, continuation brief, next-step packet, controller policy, gate-readiness preflight schemas, and Workbench action payloads. They do not authorize ToolPolicy, scheduler runtime, worker auto-start, whole-wave dispatch, slot allocation, source mutation, apply, close, child Change, or Harness evolution.

Phase 12A remains the future controlled Scheduler/parallel loop design boundary. Current runtime remains single-gate staged until a later accepted ECL change implements and verifies loop behavior.

## Next Resume Point

No active change is open and no Harness evolution is pending. A reasonable next product slice is another small Goal Loop / controlled Scheduler step that keeps current runtime single-gate staged, for example a narrow regression around integration/rework routing or main-Agent explanation without adding loop execution. `README.md` remains unrelated and must stay untracked unless the user explicitly asks to include it.

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

Use `harness/changes/INDEX.json` for the generated archive list. Start with archived `summary.md` files; open specs, plans, reviews, or source only when the current task needs that evidence.

Recent key archive summaries:

- Phase 12I Status Handoff Entropy Cleanup: `harness/changes/archive/20260618-phase-12i-status-handoff-entropy-cleanup/summary.md`.
- Phase 12H Controlled Loop Runtime Prompt Evidence: `harness/changes/archive/20260618-phase-12h-controlled-loop-runtime-prompt-evidence/summary.md`.
- Phase 12A Controlled Scheduler Loop Design Boundary: `harness/changes/archive/20260618-phase-12a-controlled-scheduler-loop-design-boundary/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12c-12g-controlled-loop-context-evidence/summary.md`.

Detailed historical phase narratives are archive-only. Do not copy them back into this handoff unless they change current agent decisions.
