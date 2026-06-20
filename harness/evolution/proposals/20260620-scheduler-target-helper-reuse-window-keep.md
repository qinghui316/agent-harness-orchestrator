# Scheduler Target Helper Reuse Window Evolution Proposal

## Decision

Proposed result: `keep / independent_review`.

No new Harness rule, template, lint check, documentation rule, product runtime behavior, Workbench behavior, scheduler behavior, IntegrationCheck behavior, Goal Loop behavior, ToolPolicyGate behavior, or human-gate behavior is proposed.

## Evidence Window

Pending window:

- `harness/changes/archive/20260620-workbench-worker-rework-validate-optional-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-worker-rework-audit-optional-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-scheduler-integration-candidate-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-scheduler-close-blocked-claim-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-scheduler-integration-check-candidate-target-helper-reuse/summary.md`

## Rationale

The candidate changes show the current Harness rules working as intended:

- Each change reused an existing Workbench action target helper from `src/workbench/actions/active-target.ts`.
- Action-specific target selection stayed in `src/workbench/actions/boundary.ts`.
- Required ids and non-equivalent scheduler semantics stayed direct rather than being forced through generic helpers.
- Scheduler runtime semantics, IntegrationCheck behavior, action ids, payload shapes, Workbench UI/projections, ToolPolicyGate, human gates, source/apply behavior, and Goal Loop behavior stayed out of scope.
- Verification used focused Workbench module-boundary tests plus typecheck/lint/build or encoding/Harness checks, with full `npm run test` skipped only when the change stayed helper-only.

Current `docs/ECL.md` and the review template already require the relevant durable behavior: Architecture Growth Control/Core Mechanism Reuse, Module Boundary coverage, Scoped Workbench Action Payload coverage, targeted verification rationale, Documentation Entropy coverage, Experience Lifecycle coverage, close/handoff drift checks, workflow-truth preservation, ToolPolicyGate preservation, and human-gate preservation.

Adding a helper-specific ECL rule would duplicate those broader rules and would promote narrow product history into reusable process guidance.

## Independent Review

Subagent `019ee2c0-514d-7b81-af04-f86cb41ffaf4` returned `EVOLUTION_APPROVED_KEEP`.

Findings:

- `keep / independent_review` is justified because the five archived changes show the current broad rules working as intended.
- No rule/template/lint/product-code promotion is warranted; a helper-specific rule with action names or field names would duplicate broader current rules and increase documentation entropy.
- The Experience Retention Scan is substantively complete across Promote, Retain, Merge, Retire, and Archive-only decisions.
- The proposal preserves useful future guidance without bloating current docs.
- Closeout must record the review, run validation, mark pending evolution complete, and verify no stale active/pending state remains.

## Experience Retention Scan

### Promote

None.

No new durable current-doc rule is needed. The existing broad rules already cover this evidence window.

### Retain

- Retain existing Architecture Growth Control/Core Mechanism Reuse guidance: feature work should strengthen shared owners before adding feature-local mechanisms.
- Retain existing Module Boundary guidance: reusable Workbench action target helpers belong in `src/workbench/actions/active-target.ts`, while action-specific target wiring belongs in `src/workbench/actions/boundary.ts`.
- Retain existing Scoped Workbench Action Payload coverage for action paths that depend on explicit target ids.
- Retain existing targeted verification guidance: selected suites should match touched boundaries, with full/slow suite skips explained in review evidence.
- Retain existing Documentation Entropy and close/handoff drift guidance: current docs carry compact active/pending/latest pointers and are rewritten after close.
- Retain workflow-truth, ToolPolicyGate, and human-gate preservation rules.

### Merge

- Merge this window's helper-specific details into this proposal and archived summaries only.
- Merge retained direct-check examples into archive/proposal evidence rather than adding another template field.

### Retire

None.

### Archive-Only

- Specific action paths such as `planning.scheduler.worker.rework-validate-first`, `planning.scheduler.worker.rework-audit-first`, `planning.scheduler.integration-candidate.compile`, `planning.scheduler.integration-check.run`, and `planning.scheduler.run.close-blocked` remain archive-only.
- Specific field names such as `schedulerWorkerReworkValidationId`, `schedulerWorkerReworkAuditId`, `schedulerIntegrationCandidateId`, `schedulerClaimReservationId`, `schedulerReconcileSnapshotId`, `applyCheckId`, and `worktreeIds` remain archive-only.
- Specific retained direct-check examples such as candidate readiness, existing validation/audit artifacts, IntegrationCheck passed-state handling, and close-blocked terminal guards remain archive-only.
- Transitional closeout examples remain archive-only because existing close/handoff drift rules already cover them.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review -Notes "..."`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`.
