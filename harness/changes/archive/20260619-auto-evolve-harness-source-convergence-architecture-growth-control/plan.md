# Plan: auto-evolve-harness-source-convergence-architecture-growth-control

## Approach

Create the smallest valid auto-evolve change. Use the pending snapshot as the trigger, expand the evidence scan to later relevant Architecture Growth Control source-convergence archives, produce a `keep` proposal if no uncovered rule gap appears, get independent review, then run `mark-complete` and close.

## Steps

1. Read pending evolution, current index/state/results, candidate archives, and later relevant source-convergence archive summaries.
2. Produce `harness/evolution/proposals/20260619-source-convergence-architecture-growth-control-keep.md`.
3. Update active ECL files and handoff docs to reflect the active auto-evolve change and pending evolution.
4. Get independent subagent evolution review before recording `keep`.
5. Run Harness validation and `scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
6. Update final handoff docs to no active / no pending and close the auto-evolve change.

## Decisions

- Treat the pending file as a trigger snapshot, not the full evidence window.
- Use `keep` only if independent review confirms existing rules are sufficient.
- Avoid new rules/templates/lints because the current archive evidence appears already covered by Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, workflow-truth, and ToolPolicy/human-gate rules.
- Keep detailed product/source-convergence narratives archive-only.

## Module Boundary Plan

- Owner module: not applicable; this is a Harness evolution record and handoff/proposal update, not product module code.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product runtime modules, Workbench, bridge, frontend, manager facades, Scheduler, Goal Loop, canonical docs/stable-memory writers, source roots, reference projects.
- Compatibility surface: no product API/runtime/Workbench behavior changes.
- Boundary tests: Harness lint and handoff drift checks.
- Follow-up split candidates: none.
- If not applicable, reason: no product module responsibility is added or moved.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Harness evolution proposal/review/results flow, Documentation Entropy, Experience Lifecycle, Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Close/Handoff Drift.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed unless independent review finds an uncovered repeated gap.
- Domain-specific logic location: archive summaries remain historical evidence; current docs keep only compact behavior-changing rules.
- Shared cross-cutting logic location: existing `docs/ECL.md` and `docs/CURRENT-DEVELOPMENT-PLAN.md` rules.
- Local framework / state machine / projection / validation / gate avoided: avoids adding a new one-off evolution rule or source-convergence mini-process when existing rules already govern it.
- Future-cost reduction for similar features: future agents get a validated `keep` record showing current rules are enough and details should stay archive-only.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Plan self-evaluation by subagent `019edc99-cf8f-7fe3-8631-2940f9a832bb` returned PASS with corrections.
- Required correction applied: include later relevant archives beyond the pending trigger snapshot.
- Required correction applied: record current handoff drift and fix final handoff before git.
- Required correction applied: use `keep` only after independent review; otherwise use dry-run `noop`.
- Required correction applied: scan both new-rule gaps and stale retained current memory across current docs/templates.

