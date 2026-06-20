# Helper Reuse Projection Window Evolution Proposal

## Decision

Proposed result: `keep / independent_review`.

No new Harness rule, template, lint check, product runtime behavior, Workbench behavior, scheduler behavior, Goal Loop behavior, ToolPolicyGate behavior, or human-gate behavior is proposed.

## Evidence Window

Pending window:

- `harness/changes/archive/20260620-workbench-scheduler-integration-check-candidate-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-scheduler-integration-outcome-handoff-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-scheduler-runtime-state-latest-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-scheduler-claim-reservation-snapshot-guard-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-maintenance-confirmation-unhandled-latest-helper-reuse/summary.md`

## Rationale

The candidate changes followed existing process and product rules:

- Scheduler integration-check and integration-outcome target helper reuse removed action-local latest-target branches while keeping IntegrationCheck, apply/discard, scheduler runtime, Workbench UI, action handler, Goal Loop, source/apply, and broad runtime behavior out of scope.
- Scheduler runtime-state latest-target helper reuse replaced repeated latest id checks with the existing Workbench action target helper while preserving cross-field lineage and runtime-state checks.
- Scheduler claim-reservation snapshot guard reuse moved repeated Workbench claim-reservation/snapshot lineage checks to the scheduler-runtime owner and kept scheduler runtime semantics unchanged.
- Maintenance confirmation projection helper reuse moved repeated latest eligible unhandled candidate selection into the read-model projection summary owner while keeping maintenance IO, fallback order, action payloads, confirmation copy, and human-gate semantics in the maintenance confirmation module.

Existing ECL already requires Core Mechanism Reuse / Architecture Growth Control, Module Boundary coverage, Read Model Projection coverage, targeted verification rationale, Documentation Entropy coverage, Experience Lifecycle scans, workflow-truth preservation, ToolPolicyGate/human-gate preservation, and close/handoff drift checks. Adding a helper-specific rule would duplicate those constraints and increase current-doc entropy.

## Independent Review

Subagent `019ee303-840d-7d20-9ecf-7d689428dc76` returned `APPROVE`.

Findings:

- The pending window can be handled as `keep / independent_review`.
- No new or modified ECL rule, template, lint, or product runtime behavior is needed.
- `AGENTS.md` and `docs/STATUS.md` need narrow handoff cleanup after `mark-complete` and close.
- `docs/STATUS.md` Archive Lookup had older scheduler runtime entries labeled as `Latest product`; those labels should be demoted to avoid stale history posing as current state.
- `docs/CURRENT-DEVELOPMENT-PLAN.md` does not need edits for this window.

## Experience Retention Scan

### Promote

None.

No new durable current-doc rule is needed. The window is already covered by current Core Mechanism Reuse, Module Boundary, Read Model Projection, targeted verification, Documentation Entropy, Experience Lifecycle, workflow-truth, ToolPolicyGate, and human-gate rules.

### Retain

- Retain Core Mechanism Reuse / Architecture Growth Control: feature work should strengthen shared owners before adding feature-local mechanisms.
- Retain Module Boundary guidance: helper ownership should stay in the relevant owner module, while domain-specific wiring stays in the domain module.
- Retain Read Model Projection coverage: derived Workbench projections must be checked against their documented scope.
- Retain targeted verification guidance: run the smallest suite that covers the touched boundary, escalate when shared runtime or release-risk surfaces change, and record full/slow suite skip rationale.
- Retain Documentation Entropy and close/handoff drift guidance: current docs carry compact active/pending/latest pointers and must be rewritten after close.
- Retain workflow-truth, ToolPolicyGate, and human-gate boundaries: helper reuse does not authorize runtime execution, source mutation, apply/merge, Scheduler loops, Goal Loop authority, or Harness evolution apply.

### Merge

- Merge this window's helper/projection-specific lessons into this proposal and archived summaries only.
- Merge the repeated targeted-verification examples under existing verification-scope guidance rather than adding another rule.

### Retire

None.

### Archive-only

- Specific action names, helper names, target ids, field names, and branch-specific stale checks remain archive-only.
- Specific scheduler integration, runtime-state, claim-reservation, and maintenance confirmation implementation steps remain archive-only.
- The stale `Latest product` Archive Lookup labels are fixed as current handoff drift, but the old scheduler runtime archives remain available through `harness/changes/INDEX.json` and the archive lookup list.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Handoff drift grep for stale active paths, pending pointers after completion, and incorrect latest labels.
