# Workbench Rework Helper Reuse Window Evolution Proposal

## Decision

Proposed result: `keep / independent_review`.

No new Harness rule, template, lint check, documentation rule, product runtime behavior, Workbench behavior, scheduler behavior, Goal Loop behavior, ToolPolicyGate behavior, or human-gate behavior is proposed.

## Evidence Window

Pending window:

- `harness/changes/archive/20260620-workbench-worker-reconcile-optional-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-worker-first-pass-optional-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-worker-rework-entry-optional-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-worker-rework-reconcile-optional-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-worker-rework-validate-optional-target-helper-reuse/summary.md`

## Rationale

The candidate changes show the current Harness rules working as intended:

- Each change reused the existing `src/workbench/actions/active-target.ts` helper owner instead of adding another feature-local optional target validator.
- Action-specific target selection stayed in `src/workbench/actions/boundary.ts`.
- Non-equivalent checks for optional already-created artifacts stayed direct rather than being forced through a generic helper.
- Scheduler runtime semantics, action ids, payload shapes, Workbench UI, ToolPolicyGate, human gates, source/apply behavior, and Goal Loop behavior stayed out of scope.
- Verification used focused Workbench module-boundary tests plus typecheck/lint/build and Harness checks, with full `npm run test` skipped only when the change stayed helper-only.

Current `docs/ECL.md` and the review template already require the relevant durable behavior: Architecture Growth Control/Core Mechanism Reuse, Module Boundary coverage, Scoped Workbench Action Payload coverage, targeted verification rationale, Documentation Entropy coverage, Experience Lifecycle coverage, close/handoff drift checks, workflow-truth preservation, ToolPolicyGate preservation, and human-gate preservation.

Adding a helper-specific ECL rule would duplicate those broader rules and would promote narrow product history into reusable process guidance.

## Independent Review

Subagent `019ee282-8ed7-7ab1-a41a-3fd894ba790f` returned PASS for `keep / independent_review`.

Findings:

- No durable rule/template/lint/product change is required from this window.
- The review template already has the right fields for helper owner reuse, retained direct checks, targeted module-boundary tests, and full-test skip rationale.
- Specific action names, field lists, retained direct-check examples, and closeout examples are too narrow for current docs and should remain in the proposal/archive.
- Handoff cleanup is required after the auto-evolve closeout so `AGENTS.md` and `docs/STATUS.md` no longer point to stale active or pending state.

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

- Specific action paths such as `planning.scheduler.worker.rework-validate-first` remain archive-only.
- Specific field names such as `schedulerWorkerAuditId`, `reworkRunId`, `schedulerWorkerReworkValidationId`, and `reworkValidationRunId` remain archive-only.
- Specific retained direct-check examples such as `existingResult` and `existingValidation` remain archive-only.
- Transitional closeout examples remain archive-only because existing close/handoff drift rules already cover them.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review -Notes "..."`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`.
