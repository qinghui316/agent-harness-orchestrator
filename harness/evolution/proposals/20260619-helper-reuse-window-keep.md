# Helper Reuse Window Harness Evolution Proposal

## Candidate Window

Pending trigger archives:

- `harness/changes/archive/20260619-maintenance-markdown-evidence-list-renderer-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-simple-markdown-list-helper-reuse/summary.md`
- `harness/changes/archive/20260619-workbench-schedulerrun-prepared-target-helper-reuse/summary.md`
- `harness/changes/archive/20260619-workbench-scheduler-planning-latest-target-helper-adoption/summary.md`
- `harness/changes/archive/20260619-workflow-scheduler-latest-artifact-guard-reuse/summary.md`

## Independent Review

Subagent `019ede5f-6234-7ce0-97b2-3b888d2ea706` recommended PASS for a
`keep / independent_review` result.

The review found that the five candidates are repeated examples of existing
Architecture Growth Control / Core Mechanism Reuse and Module Boundary rules
working as intended. The window does not expose a missing durable Harness rule,
template field, lint check, product runtime behavior, Workbench action,
Scheduler behavior, Goal Loop behavior, ToolPolicy/human-gate rule, or reference
project update.

The review did identify stale handoff after the product change close:
`AGENTS.md` and `docs/STATUS.md` still pointed at the just-closed product active
path while `harness/evolution/pending.md` existed. This auto-evolve change
records and fixes that as Documentation Entropy / Close-Handoff Drift, not as a
new lint requirement because current `lint-ecl` already detects the inconsistency.

## Recommendation

Status: `keep`

Keep existing current rules as sufficient durable Harness memory. Do not add a
new ECL rule, template field, lint check, CI check, product runtime behavior,
Workbench action, source change, or reference-source change.

## Experience Retention Scan

Scope checked:

- `AGENTS.md`
- `docs/STATUS.md`
- `docs/ECL.md`
- `harness/templates/change/`
- `docs/CURRENT-DEVELOPMENT-PLAN.md`
- `docs/AGENT-DEVELOPMENT-OS.md`

| Candidate lesson | Decision | Rationale |
| --- | --- | --- |
| Maintenance markdown Evidence artifact refs and simple string lists should use the maintenance markdown owner | Archive-only for details; retain current rule | The two maintenance markdown archives prove the pattern. The general owner/reuse rule already lives in Core Mechanism Reuse and Module Boundary coverage. |
| Workbench SchedulerRun prepared-target checks and scheduler planning latest-target checks should use the Workbench action target owner | Archive-only for details; retain current rule | The two Workbench archives prove existing action target revalidation rules are working. Implementation details should remain archive-only. |
| Workflow scheduler latest artifact id checks should use a scheduler-domain guard owner | Archive-only for details; retain current rule | The scheduler guard archive proves the same reuse principle inside the scheduler domain. No new Harness wording is needed. |
| Helper-reuse slices should keep status, lineage, source-hash, ToolPolicyGate, human-gate, Workbench UI/action, Goal Loop, scheduler runtime, and manager-facade behavior out of scope unless explicitly accepted | Retain | Current Product Boundaries, Module Boundary, Core Mechanism Reuse, workflow-truth, ToolPolicyGate, and human-gate rules already cover this. |
| Repeated helper-reuse lessons should become separate new current rules | Merge | The lessons merge into the already-current Architecture Growth Control / Core Mechanism Reuse and Module Boundary rules. |
| Stale active product handoff after product close and pending evolution trigger | Retire | Final handoff must point to this active auto-evolve change while active, then to latest archives and no pending evolution after close. |
| Detailed per-change validation narratives and helper implementation choices | Archive-only | Durable history belongs in archived summaries and this proposal, not in current entry/handoff docs. |
| New durable Harness rule/template/lint | Promote: none | Existing rules are sufficient, current, and broader than this specific helper-reuse window. |

## Documentation Entropy

Line counts before auto-evolve implementation:

- `AGENTS.md`: 145
- `docs/STATUS.md`: 103
- `docs/ECL.md`: 449
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: 72
- `docs/AGENT-DEVELOPMENT-OS.md`: 212
- `harness/templates/change/`: 5 files

Current-state scan before this proposal:

- `AGENTS.md` and `docs/STATUS.md` had stale product active-path handoff after
  `Workflow Scheduler Latest Artifact Guard Reuse` was closed and pending
  evolution was generated.
- `harness/evolution/pending.md` exists and should be handled by this active
  auto-evolve change.
- `docs/ECL.md`, `harness/templates/change/`, and current roadmap docs already
  contain the needed Documentation Entropy, Experience Lifecycle, Module
  Boundary, Close/Handoff Drift, and Core Mechanism Reuse coverage.

No current docs are expanded with helper-reuse implementation details. Final
close should add only latest archive pointers and remove active/pending state.

## Boundaries

- No product runtime behavior changes.
- No source-root, canonical docs, stable memory, ECL rule/template, Workbench
  action, Scheduler runtime, Goal Loop, ToolPolicyGate, human gate, apply/close
  behavior, remote behavior, reference source, or README change.
- Pending evolution is completed only through proposal, independent review,
  validation, results.tsv, state update, and `mark-complete`.
