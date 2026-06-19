# Maintenance Section Helper Window Evolution Proposal

## Decision

Proposed result: `keep / independent_review`.

No new Harness rule, template, lint check, product runtime behavior, Workbench behavior, scheduler behavior, Goal Loop behavior, ToolPolicyGate behavior, or human-gate behavior is proposed.

## Evidence Window

Pending window:

- `harness/changes/archive/20260620-workbench-feedback-conversation-test-domain-split/summary.md`
- `harness/changes/archive/20260620-workbench-agenttask-residual-test-domain-split/summary.md`
- `harness/changes/archive/20260620-maintenance-canonical-artifact-lifecycle-reuse/summary.md`
- `harness/changes/archive/20260620-maintenance-canonical-authority-markdown-reuse/summary.md`
- `harness/changes/archive/20260620-maintenance-markdown-section-helper-reuse/summary.md`

## Rationale

The candidate changes followed existing process and product rules:

- Workbench test changes moved residual coverage into explicit capability-domain suites, reused existing fixtures, and recorded targeted verification instead of running the full suite by default.
- Maintenance/canonical changes reused existing shared owners for artifact lifecycle, authority Markdown, and generic maintenance Markdown section layout.
- Each maintenance helper change kept schemas, ids, lineage, target validation, ledger behavior, ToolPolicyGate, human gates, Workbench actions, runtime, scheduler, Goal Loop, and source mutation out of scope.
- Close-ready reviews found no new architecture rule gap; blockers were stale ECL/handoff wording that existing close/handoff rules already cover.

The current ECL already requires Architecture Growth Control/Core Mechanism Reuse, Module Boundary coverage, Documentation Entropy coverage, Experience Lifecycle scans, workflow-truth preservation, ToolPolicyGate/human-gate preservation, targeted verification rationale, and close/handoff drift checks. Adding another rule would mostly duplicate those constraints.

## Experience Retention Scan

### Promote

None.

No new durable current-doc rule is needed. The observed lessons are already covered by current ECL rules for Architecture Growth Control/Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, and close/handoff drift.

### Retain

- Retain existing Architecture Growth Control/Core Mechanism Reuse guidance: feature work should strengthen shared owners before adding feature-local frameworks.
- Retain existing Module Boundary guidance: owner modules should be named before implementation, and broad facades should remain thin.
- Retain existing Documentation Entropy and Experience Lifecycle guidance: archive details stay in summaries and generated indexes; current docs keep compact behavior-changing rules.
- Retain existing Workbench test architecture guidance: new Workbench coverage belongs in explicit capability-domain suites, with slow scenarios kept out of ordinary unit iteration.
- Retain existing targeted verification guidance: run affected capability suites, adjacent risk suites, and product checks first; full suites are justified when touched boundaries warrant them.

### Merge

- Merge this window's helper-specific details into the archived proposal rationale only. Do not duplicate artifact lifecycle, authority Markdown, or section helper examples in `docs/ECL.md`, `AGENTS.md`, or `docs/STATUS.md`.
- Merge the Workbench test split examples into the existing test-strategy rule rather than adding a separate rule for residual test files.

### Retire

- Retire stale `docs/STATUS.md` archive lookup wording that still labeled `maintenance-canonical-authority-markdown-reuse` as the latest product change after `maintenance-markdown-section-helper-reuse` had closed.

No Harness rule, template, or lint change is needed for this correction; the existing close/handoff drift rule already covers it.

### Archive-Only

- Specific helper names and implementation steps from the three maintenance/canonical changes remain archive-only.
- Specific moved Workbench test names and package-script ordering details remain archive-only.
- Repeated closeout wording repair examples remain archive-only because existing close/handoff drift rules already address them.

## Validation Plan

- Independent subagent review of this proposal.
- `harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
- `lint-ecl`, `lint-encoding`, `harness-change reindex/status`, and `harness-evolve check`.
