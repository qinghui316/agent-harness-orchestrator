# Workbench Target Helper Verification Window Evolution Proposal

## Decision

Proposed result: `keep / independent_review`.

No new Harness rule, template, lint check, product runtime behavior, Workbench behavior, scheduler behavior, Goal Loop behavior, ToolPolicyGate behavior, or human-gate behavior is proposed.

## Evidence Window

Pending window:

- `harness/changes/archive/20260620-maintenance-markdown-section-helper-reuse/summary.md`
- `harness/changes/archive/20260620-verification-scope-guidance-alignment/summary.md`
- `harness/changes/archive/20260620-workbench-action-array-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-action-scalar-target-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-worker-reconcile-optional-target-helper-reuse/summary.md`

## Rationale

The candidate changes followed existing process and product rules:

- Maintenance Markdown helper reuse consolidated repeated section layout under the existing maintenance Markdown owner and kept schemas, ids, lineage, target validation, ledger behavior, ToolPolicyGate, human gates, Workbench actions, runtime, scheduler, Goal Loop, and source mutation out of scope.
- Verification-scope guidance alignment already promoted the relevant lesson: start with the smallest command set that covers the touched boundary, then document why full or slow suites are skipped.
- Workbench array/scalar/worker target helper reuse strengthened the existing `active-target.ts` owner and kept action ids, payload shapes, scheduler execution semantics, Workbench UI, ToolPolicyGate, human gates, and runtime behavior out of scope.
- The worker reconcile helper adoption consciously standardized mismatch text to the existing helper wording while preserving fail-closed optional request-vs-latest comparison behavior.

The current ECL already requires Architecture Growth Control/Core Mechanism Reuse, Module Boundary coverage, Documentation Entropy coverage, Experience Lifecycle scans, workflow-truth preservation, ToolPolicyGate/human-gate preservation, targeted verification rationale, and close/handoff drift checks. Adding another rule would duplicate those constraints.

## Independent Review

Subagent `019ee256-3a83-75a3-94b1-16e98943c31a` returned PASS.

Findings:

- No durable Harness rule is needed for helper reuse or error text normalization. Existing Module Boundary and Core Mechanism Reuse rules cover helper owner reuse and target mismatch semantics.
- No new targeted-test rule is needed. `docs/ECL.md` and the review template already require selected verification scope, escalation criteria, and full/slow-suite skip rationale.
- Current handoff drift after product close is operational cleanup covered by existing close/handoff drift rules, not evidence for a new rule/template/lint/product runtime change.

## Experience Retention Scan

### Promote

None.

No new durable current-doc rule is needed. Verification-scope guidance was already promoted in `20260620-verification-scope-guidance-alignment`.

### Retain

- Retain existing Architecture Growth Control/Core Mechanism Reuse guidance: feature work should strengthen shared owners before adding feature-local mechanisms.
- Retain existing Module Boundary guidance: Workbench action target helpers belong in `src/workbench/actions/active-target.ts`, while action-specific target wiring belongs in `src/workbench/actions/boundary.ts`.
- Retain existing targeted verification guidance: selected suites should match touched boundaries, with full/slow suite skips explained in review evidence.
- Retain existing Documentation Entropy and close/handoff drift guidance: current docs carry compact active/pending/latest pointers and are rewritten after close.

### Merge

- Merge this window's helper-specific details into this archived proposal only.
- Merge the targeted verification examples into the existing verification-scope guidance rather than adding another rule.

### Retire

None.

### Archive-Only

- Specific Workbench helper names, field lists, and action-path implementation steps remain archive-only.
- Specific maintenance Markdown renderer examples remain archive-only.
- The product-close handoff drift example remains archive-only because existing close/handoff drift rules already cover it.

## Validation Plan

- `scripts/harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
- `lint-ecl`, `lint-encoding`, `harness-change reindex/status`, and `harness-evolve check`.
