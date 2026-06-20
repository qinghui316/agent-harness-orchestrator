# Evolution Proposal: Workbench Helper Boundary Window

## Decision

Recommended result: `keep / independent_review`.

The pending window shows repeated success applying existing Architecture Growth Control and Core Mechanism Reuse rules to Workbench helper, projection, artifact-selection, and test-boundary work. No new durable ECL rule, template, lint, product runtime behavior, or Workbench behavior is required.

## Candidate Archives

- `harness/changes/archive/20260620-workbench-maintenance-confirmation-unhandled-latest-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-read-model-evidence-action-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-confirmation-evidence-refs-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-landing-review-artifact-selection-helper-reuse/summary.md`
- `harness/changes/archive/20260620-workbench-helper-boundaries-test-suite-split/summary.md`

## Evidence Summary

The first four product changes converged repeated helper patterns into existing Workbench owners:

- latest eligible maintenance confirmation target selection belongs in read-model projection summary helpers;
- evidence action construction belongs in read-model evidence action helpers;
- evidence reference arrays belong in read-model evidence ref helpers;
- landing review artifact selection belongs in one Workbench artifact-selection helper.

The fifth change moved pure helper-boundary assertions into a dedicated helper suite and kept broad facade/export/wiring assertions in the existing module-boundary suite. It corrected test iteration cost without changing product behavior.

Together, the window reinforces existing rules:

- feature modules should express domain differences;
- shared helper, projection, target, artifact, and gate logic belongs in owned reusable modules;
- test topology may be adjusted when it materially improves future feature iteration;
- product-function progress should not be delayed by repeated standalone convergence once the rule is already covered.

## Experience Retention Scan

### Promote

None. `docs/ECL.md` already contains Core Mechanism Reuse / Architecture Growth Control, Module Boundary, Read Model Projection, targeted verification, Documentation Entropy, and Experience Lifecycle coverage.

### Retain

- Retain the existing requirement that new product or architecture changes name reused core mechanisms and avoid feature-local mini-frameworks.
- Retain module-boundary coverage that names owner modules and forbids new main logic in broad compatibility facades.
- Retain targeted verification guidance: run the smallest suite that covers the touched boundary and explain why aggregate/full suites are skipped.
- Retain documentation entropy and handoff drift checks for active/pending/latest state.

### Merge

- Merge the helper/projection-specific lesson into the existing general rule: shared cross-cutting behavior belongs in owned reusable mechanisms, while feature modules express only domain differences.
- Merge the test-topology lesson into existing verification guidance: split or target tests when doing so materially lowers iteration cost for future product work.

### Retire

None from current docs. The stale old-active handoff fields are operational drift, not durable experience; they are fixed by updating `AGENTS.md` and `docs/STATUS.md`.

### Archive-only

Keep concrete helper names, action ids, file names, field names, exact assertion strings, and implementation steps in archived summaries and tests. They do not need to become current-process rules.

## Boundary Classification

This proposal is non-executing Harness evolution evidence. It does not authorize or implement product runtime, Workbench runtime, Scheduler, Goal Loop, source apply, remote handoff, ToolPolicyGate, human-gate, or automatic documentation rewrite behavior.

## Validation Plan

- Record independent subagent approval.
- Run `harness-evolve.ps1 mark-complete -Status keep -EvalMode independent_review`.
- Run ECL, encoding, reindex, status, and evolve checks.
- Update final handoff docs to no active/no pending/latest archive state.

## Rationale

Adding a new helper-specific rule would duplicate existing current rules and continue the pattern the user explicitly corrected: too many standalone architecture/test convergence steps. The useful action is to close this evolution cleanly, keep details archive-only, and resume product-function progress next.
