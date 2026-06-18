# Project Status

## Current Handoff

- Current date: 2026-06-18.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260618-phase-12k-product-memory-lifecycle-target/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260618-phase-12k-product-memory-lifecycle-target/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12g-12k-memory-lifecycle-evidence/summary.md`.
- Active product phase: none. Active Harness evolution phase: none.
- Active close status: no active change.

This file is the short resume point. Phase 12K is archived after recording product-level maintenance/self-evolution targets for documentation entropy, stable-memory budget, stale-current-state detection, and candidate experience lifecycle decisions. The latest Harness evolution retained Phase 12G-12K lessons, tracked `docs/PRODUCT.md` and `docs/MEMORY.md` as product source docs, and added no broader Harness rule/template/lint or runtime behavior.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`. Historical detail belongs in archived summaries and `harness/changes/INDEX.json`.

## Current Baseline

The product baseline is post-Phase-12K. Goal Loop controlled-loop state and routing posture remain non-executing evidence only. Fresh Workpad-visible main-Agent context can add `goal-loop-controlled-loop-state` and `goal-loop-routing-posture` to actual `chat.ask` / `orchestrator.plan` `run.json.promptStack`, plus compact `goalLoopControlledLoopState` and nested `goalLoopRoutingPostureEvidence` refs to `context.prepared`; stale or hidden Goal Loop context omits those labels/refs. Product-level maintenance now records stable-memory/docs entropy control and candidate lifecycle decisions as a future AHO self-evolution target.

The scheduler-loop snapshot and controlled-loop state remain absent from iteration, continuation brief, next-step packet, controller policy, gate-readiness preflight schemas, and Workbench action payloads. They do not authorize ToolPolicy, scheduler runtime, worker auto-start, whole-wave dispatch, slot allocation, source mutation, apply, close, child Change, or Harness evolution.

Phase 12A remains the future controlled Scheduler/parallel loop design boundary. Current runtime remains single-gate staged until a later accepted ECL change implements and verifies loop behavior.

## Next Resume Point

No active change is open and no Harness evolution is pending. A reasonable next product slice is another small Goal Loop / controlled Scheduler step that keeps current runtime single-gate staged, for example a narrow explanation/read-model regression around completion or closeout handoff without adding loop execution. `README.md` remains unrelated and must stay untracked unless the user explicitly asks to include it.

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
- Phase 12K Product Memory Lifecycle Target: `harness/changes/archive/20260618-phase-12k-product-memory-lifecycle-target/summary.md`.
- Phase 12J Goal Loop Routing Posture Runtime Evidence: `harness/changes/archive/20260618-phase-12j-goal-loop-routing-posture-runtime-evidence/summary.md`.
- Phase 12H Controlled Loop Runtime Prompt Evidence: `harness/changes/archive/20260618-phase-12h-controlled-loop-runtime-prompt-evidence/summary.md`.
- Phase 12A Controlled Scheduler Loop Design Boundary: `harness/changes/archive/20260618-phase-12a-controlled-scheduler-loop-design-boundary/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12g-12k-memory-lifecycle-evidence/summary.md`.

Detailed historical phase narratives are archive-only. Do not copy them back into this handoff unless they change current agent decisions.
