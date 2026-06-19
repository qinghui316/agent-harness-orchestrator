# Plan: auto-evolve-harness-candidate-window-order

## Approach

Make the smallest machinery repair that makes pending evolution evidence truthful for the current local Harness: order archive directories by `LastWriteTimeUtc` and name before candidate selection, and filter auto-evolve archives out of the candidate evidence list. Keep the existing threshold/count and state-file model compatible. Then regenerate pending evidence and complete the semantic evolution review over the corrected window.

## Steps

1. Record the stale pending evidence and prior completed Workbench evolution row.
2. Update `scripts/harness-evolve.ps1` candidate archive ordering.
3. Regenerate `harness/evolution/pending.md` and record the corrected candidate window.
4. Write `harness/evolution/proposals/20260619-candidate-window-order-keep.md` with Experience Retention Scan.
5. Run independent close/evolution review.
6. Run Harness validation, `mark-complete`, close the ECL change, and update final handoff docs.

## Decisions

- Use `LastWriteTimeUtc, Name` as the close-order proxy for this narrow repair.
- Keep archive counts compatible with the existing `state.json` model, but filter auto-evolve archives from candidate evidence so prior evolution records are not treated as product evidence.
- Do not redesign evolution state around persisted archive ids in this change; record that as a possible future hardening if the proxy proves insufficient.
- Evaluate the corrected candidate window after script repair; do not count the script repair alone as a completed evolution.

## Module Boundary Plan

- Owner module: `scripts/harness-evolve.ps1`.
- New / moved responsibilities: archive candidate ordering for evolution checks becomes close-order-proxy based instead of name-only; candidate summaries exclude auto-evolve archive records.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench, Scheduler, Goal Loop, ToolPolicyGate, human-gate, runtime bridges, remote handoff, and README.
- Compatibility surface: existing `check`, `status`, and `mark-complete` command names and result/state file formats remain compatible.
- Boundary tests: Harness command validation and regenerated pending evidence inspection.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing lightweight Harness evolution threshold/check/mark-complete mechanism.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; the current candidate ordering is repaired.
- Domain-specific logic location: not applicable.
- Shared cross-cutting logic location: `scripts/harness-evolve.ps1`.
- Local framework / state machine / projection / validation / gate avoided: avoids creating a parallel evolution evaluator or manual pending maintenance path.
- Future-cost reduction for similar features: future pending evolution windows should point to the latest close-order evidence, reducing duplicate review and stale candidate handling.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Current state stores only `last_completed_archive_count`, not archive ids or close timestamps. This change keeps the existing model and uses filesystem close-order evidence as a bounded repair.
- A durable archive-id watermark could be considered later, but it is out of scope for this evolution slice.
- Subagent plan review passed and required the corrected-window evaluation after script repair.
