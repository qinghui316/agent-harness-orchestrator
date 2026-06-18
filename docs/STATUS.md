# Project Status

## Current Handoff

- Current date: 2026-06-18.
- Active ECL change: none.
- Pending Harness evolution: none.
- Latest archived product change: `harness/changes/archive/20260618-phase-12q-product-maintenance-canonical-update-decision-gate/summary.md`.
- Latest archived product/Harness docs change: `harness/changes/archive/20260618-phase-12q-product-maintenance-canonical-update-decision-gate/summary.md`.
- Latest archived Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12k-12o-lifecycle-handoff-drift/summary.md`.
- Active product phase: none.
- Active Harness evolution phase: none.
- Active close status: no active change.

This file is the short resume point. Phase 12Q is archived after adding a project-level human-gated maintenance canonical update decision record for Phase 12P proposal evidence without automatic stable-memory, canonical documentation, source, apply/close, remote landing, or Harness evolution mutation. Phase 12P is archived after adding non-executing product-maintenance canonical update proposal evidence derived from Phase 12O lifecycle resolutions. The latest Harness evolution handled the Phase 12K-12O pending window, marked it complete as `keep/independent_review`, and corrected current-plan drift after Phase 12O.

Current plan-level roadmap context is preserved in `docs/CURRENT-DEVELOPMENT-PLAN.md`. Historical detail belongs in archived summaries and `harness/changes/INDEX.json`.

## Current Baseline

The product baseline is post-Phase-12Q with no pending Harness evolution. Goal Loop controlled-loop state, routing posture, and SchedulerRun terminal handoff evidence remain non-executing evidence only. Fresh Workpad-visible main-Agent context can add `goal-loop-controlled-loop-state`, `goal-loop-routing-posture`, and when terminal SchedulerRun parity matches, `goal-loop-scheduler-terminal-handoff` to actual `chat.ask` / `orchestrator.plan` `run.json.promptStack`, plus compact refs to `context.prepared`; stale or hidden Goal Loop context omits those labels/refs. SchedulerRun terminal Workpad completion and blocked-closeout cards explicitly state they are read-only evidence and do not authorize loop/full-executor/dispatch/slot/source/apply/close/merge/Harness-evolution behavior. Product-level maintenance now writes candidate lifecycle-resolution evidence, canonical update proposal evidence, and human-gated canonical update decision records after candidate score/review while still forbidding automatic canonical rewrites.

The scheduler-loop snapshot and controlled-loop state remain absent from iteration, continuation brief, next-step packet, controller policy, gate-readiness preflight schemas, and Workbench action payloads. They do not authorize ToolPolicy, scheduler runtime, worker auto-start, whole-wave dispatch, slot allocation, source mutation, apply, close, child Change, or Harness evolution.

Phase 12A remains the future controlled Scheduler/parallel loop design boundary. Current runtime remains single-gate staged until a later accepted ECL change implements and verifies loop behavior.

## Next Resume Point

No active change is open and no Harness evolution is pending. Next structured product work should continue from `docs/CURRENT-DEVELOPMENT-PLAN.md`; for product maintenance, the next slice is a separate canonical patch/update proposal and human-gated application path built from Phase 12P proposal evidence and Phase 12Q decision evidence, before any automatic rewrite behavior. Stale documentation cleanup should be folded into the relevant product stage instead of split into a standalone phase unless the user explicitly asks for documentation-only work; keep `README.md` unrelated and untracked unless the user explicitly asks to include it.

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
- Phase 12P Product Maintenance Canonical Update Proposal Evidence: `harness/changes/archive/20260618-phase-12p-product-maintenance-canonical-update-proposal-evidence/summary.md`.
- Phase 12O Product Maintenance Candidate Lifecycle Resolution: `harness/changes/archive/20260618-phase-12o-product-maintenance-candidate-lifecycle-resolution/summary.md`.
- Phase 12N Scheduler Terminal Handoff Prompt Evidence: `harness/changes/archive/20260618-phase-12n-scheduler-terminal-handoff-prompt-evidence/summary.md`.
- Phase 12M Current Plan Phase 12L Drift Alignment: `harness/changes/archive/20260618-phase-12m-current-plan-phase-12l-drift-alignment/summary.md`.
- Phase 12L Scheduler Terminal Workpad Boundary Copy: `harness/changes/archive/20260618-phase-12l-scheduler-terminal-workpad-boundary-copy/summary.md`.
- Phase 12K Product Memory Lifecycle Target: `harness/changes/archive/20260618-phase-12k-product-memory-lifecycle-target/summary.md`.
- Phase 12J Goal Loop Routing Posture Runtime Evidence: `harness/changes/archive/20260618-phase-12j-goal-loop-routing-posture-runtime-evidence/summary.md`.
- Phase 12H Controlled Loop Runtime Prompt Evidence: `harness/changes/archive/20260618-phase-12h-controlled-loop-runtime-prompt-evidence/summary.md`.
- Phase 12A Controlled Scheduler Loop Design Boundary: `harness/changes/archive/20260618-phase-12a-controlled-scheduler-loop-design-boundary/summary.md`.
- Latest Harness evolution: `harness/changes/archive/20260618-auto-evolve-harness-phase-12k-12o-lifecycle-handoff-drift/summary.md`.

Detailed historical phase narratives are archive-only. Do not copy them back into this handoff unless they change current agent decisions.
