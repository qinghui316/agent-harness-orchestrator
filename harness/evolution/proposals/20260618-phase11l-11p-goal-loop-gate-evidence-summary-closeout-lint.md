# Phase 11L-11P Goal Loop Gate Evidence Summary Closeout Lint

## Decision

- Proposed status: `keep`
- Evaluation mode: `independent_review`
- Candidate window:
  - `harness/changes/archive/20260617-phase-11l-goal-loop-assisted-gate-scheduler-mode-guard/summary.md`
  - `harness/changes/archive/20260618-phase-11m-goal-loop-enabled-gate-projection-guard/summary.md`
  - `harness/changes/archive/20260618-phase-11n-goal-loop-enabled-gate-revalidation-guard/summary.md`
  - `harness/changes/archive/20260618-phase-11o-goal-loop-blocked-closeout-handoff/summary.md`
  - `harness/changes/archive/20260618-phase-11p-goal-loop-start-first-handoff-regression/summary.md`

## Evidence Summary

Phase 11L-11P continued the same Goal Loop pattern: evidence may recommend, explain, project, preflight, and assist one matching concrete Harness gate, but it must not authorize scheduler execution, source mutation, ToolPolicy bypass, human gate bypass, whole-wave dispatch, slot allocation, apply/merge/close, or child Changes.

The product-side boundaries held. The repeated process gap was closeout hygiene: Phase 11M and Phase 11P summaries retained the instructional line beginning `Before close, replace this with` after being marked close-ready and archived. A broader scan found the same residue in older archives too, so archive-wide enforcement would turn this narrow evolution into historical cleanup. The durable fix is to fail close-ready active changes before archive.

## Existing Rule Coverage

Existing product boundary rules remain sufficient:

- Goal Loop Boundary already covers recommendation authority, stale suppression, feedback evidence boundaries, ToolPolicy/human gate preservation, and no hidden execution.
- Proposal / Runtime Boundary already covers non-executing artifacts that could be mistaken for runtime authority.
- Scoped Workbench Action Payload and Source Apply Safety already cover concrete target ids and no source mutation.
- Module Boundary remains sufficient for production code ownership and facade placement.

Existing close/handoff rules were incomplete for summary closeout text. `lint-ecl` already checked close-ready active and archived review files for stale status and verification placeholders, but it did not check `summary.md` for retained closeout instructions.

## Experience Retention Scan

| Decision | Item | Rationale |
| --- | --- | --- |
| Promote | Active close-ready summary closeout lint | Prevents future archived summaries from retaining the closeout instruction while preserving the template during active planning. |
| Retain | Goal Loop Boundary | Candidate product behavior still fits the existing non-executing, scoped, stale-fail-closed rule set. |
| Retain | Proposal / Runtime Boundary | Still covers scheduler/Goal Loop evidence artifacts that look like authority but are not. |
| Retain | Scoped Workbench Action Payload / Source Apply Safety | Still covers concrete gate target matching and no source mutation. |
| Retain | Documentation Entropy / Close-Handoff Drift | Still owns current handoff and close/archive alignment. |
| Archive-only | Phase-specific gate ids and scheduler target combinations | Product regression evidence belongs in archived summaries and tests, not new Harness process text. |
| Archive-only | Older archive summary residue | Useful evidence for why prevention belongs at active close-ready time; broad cleanup is not required for this narrow rule. |
| Merge | None | The missing rule is small enough to add beside existing close-ready review checks. |
| Retire | None | No stale Harness rule should be removed. |

## Cross-Doc Old Experience Scan

- `AGENTS.md`: should point to the active auto-evolve change while it is open, then no active/no pending after close.
- `docs/STATUS.md`: should record Phase 11P as completed and this evolution as active until close; it should not copy full candidate details beyond a compact handoff.
- `docs/ECL.md`: already says summaries must be updated before close; no wording change is needed because the gap is machine enforcement.
- `harness/templates/change/summary.md`: retain the instructional line for active changes that are not close-ready.
- `scripts/lint-ecl.ps1`: owns the promoted machine check.

## Proposed Validation

- Independent subagent review of this proposal and rule boundary.
- Targeted lint behavior check: temporarily verify a non-close-ready active summary retaining the instruction still passes, then verify a close-ready active summary retaining the same instruction fails with `summary retains close instruction template text`, restoring the original summary afterward.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review -Notes "..."`

## Recommendation

Proceed with `keep/independent_review`: add active close-ready summary closeout lint only. Do not change product runtime, Workbench, Goal Loop, Scheduler, ToolPolicy, source apply, human gates, or Harness templates.
