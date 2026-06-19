# Candidate Window Order Harness Evolution Proposal

## Trigger Evidence

Initial pending trigger snapshot repeated the Workbench helper-reuse window:

- `harness/changes/archive/20260619-workbench-action-active-target-revalidation-reuse/summary.md`
- `harness/changes/archive/20260619-workbench-action-target-revalidation-helper-reuse/summary.md`
- `harness/changes/archive/20260619-workbench-maintenance-confirmation-projection-summary-reuse/summary.md`
- `harness/changes/archive/20260619-workbench-projection-summary-helper-reuse/summary.md`
- `harness/changes/archive/20260619-workbench-read-model-timestamp-summary-helper-reuse/summary.md`

That window was already handled by `harness/changes/archive/20260619-auto-evolve-harness-workbench-reuse-window/summary.md` and `harness/evolution/results.tsv` at archive count `302`.

Root cause: `scripts/harness-evolve.ps1` counted archived changes but selected candidate summaries from directories sorted by name. Newer `maintenance-*` archives sort before older `workbench-*` archives, so `Select-Object -Last $delta` could select stale candidates. After changing ordering to `LastWriteTimeUtc, Name`, the previous auto-evolve archive also appeared in the candidate window because the existing auto-evolve exclusion regex did not match date-prefixed archive names.

## Corrected Candidate Window

After the script repair, regenerated pending evolution points to:

- `harness/changes/archive/20260619-maintenance-store-backed-artifact-ref-list-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-operation-lineage-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-proposal-operation-id-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-target-kinds-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-application-authority-helper-reuse/summary.md`

Current archive count: `307`.

## Recommendation

Status: `keep`, pending independent review.

Keep the focused Harness machinery repair in `scripts/harness-evolve.ps1`: candidate archives are ordered by close-order proxy and candidate evidence excludes auto-evolve archive summaries. Do not add a new ECL rule, review-template field, product runtime behavior, Workbench action, Scheduler behavior, Goal Loop behavior, ToolPolicyGate behavior, human-gate behavior, source mutation, or broad documentation expansion.

The corrected candidate window shows the Architecture Growth Control / Core Mechanism Reuse rule is being applied: repeated maintenance canonical patch mechanics are moving into existing owners or small focused owner modules. No additional durable process rule is needed beyond the script repair.

## Experience Retention Scan

| Candidate lesson | Decision | Rationale |
| --- | --- | --- |
| Auto-evolve pending candidate selection must use close-order evidence, not directory-name order | Promote | Implemented as a focused `scripts/harness-evolve.ps1` machinery repair. |
| Auto-evolve archive records should not be treated as product candidate evidence | Promote | Implemented as candidate-list filtering while preserving the existing archive count/state model. |
| Repeated maintenance artifact refs should move into artifact-store owners | Retain | Existing Core Mechanism Reuse and Module Boundary rules already cover this; implementation detail remains in archive summaries. |
| Repeated canonical patch operation lineage and ids should move into lineage owners | Retain | Existing Architecture Growth Control rules are sufficient and have been applied in the corrected window. |
| Repeated target-kind and application-authority mechanics should become focused shared helpers | Retain | Existing rules already require shared cross-cutting logic to live in clear owners. |
| Detailed maintenance helper-reuse phase narratives | Archive-only | Useful historical evidence, but current docs should not copy phase-by-phase implementation detail. |
| Duplicate Workbench helper-reuse pending snapshot | Archive-only | Already reviewed at archive count `302`; it is evidence for the script repair, not a new candidate window to re-review. |
| Durable archive-id watermark instead of count plus filesystem close-order proxy | Archive-only for now | Potential future hardening, but larger than this narrow repair and not required to resolve the current stale pending evidence. |
| Stale active/pending handoff wording | Retire during close | `AGENTS.md` and `docs/STATUS.md` must return to no-active/no-pending after `mark-complete` and close. |

## Current Memory Scan

- `AGENTS.md`: should point to this active auto-evolve change during processing, then return to no active change and no pending evolution after close.
- `docs/STATUS.md`: should explain the active candidate-window repair during processing, then point to the archived evolution summary after close.
- `docs/ECL.md`: existing Documentation Entropy, Experience Lifecycle, Core Mechanism Reuse, Module Boundary, Close/Handoff Drift, ToolPolicy, and human-gate rules are sufficient.
- `harness/templates/change/*`: no template change required.
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: no roadmap change required; convergence-before-expansion guidance remains current.

## Boundaries

- No product runtime behavior changes.
- No ECL rule/template/lint expansion.
- No Workbench, Scheduler, Goal Loop, ToolPolicyGate, human gate, source apply, remote handoff, README, or broad documentation changes.
- Pending evolution completes only after independent review, validation, `results.tsv`, and `scripts/harness-evolve.ps1 mark-complete`.
