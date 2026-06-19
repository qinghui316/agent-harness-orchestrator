# Maintenance Store / Authority Reuse Window Evolution Proposal

## Decision

Result: `keep`

Evaluation mode: `independent_review`

No Harness rule, template, lint, documentation, or product runtime change is proposed.

## Candidate Window

Pending evolution was generated after five archived product changes:

- `harness/changes/archive/20260619-maintenance-canonical-patch-application-authority-profile-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-update-patch-proposal-authority-profile-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-artifact-store-descriptor-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-markdown-detail-item-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-artifact-store-write-validation-reuse/summary.md`

## Evidence Summary

The window repeats a healthy convergence pattern:

- authority boolean combinations moved into `src/agent-task/canonical-patch-application-authority.ts`;
- canonical artifact store descriptors were reused from existing owners instead of rebuilt locally;
- repeated multi-line maintenance Markdown rendering moved into `src/agent-task/maintenance-markdown.ts`;
- store-backed write-time validation moved into `src/agent-task/maintenance-artifact-store.ts`;
- each change preserved artifact schemas, ids, Markdown output, ledger behavior, Workbench behavior, scheduler/Goal Loop boundaries, ToolPolicyGate, human gates, runtime authority, and source mutation boundaries.

## Existing Rule Coverage

The current Harness already covers this lesson:

- ECL 13.6 Module Boundary requires future product features to name owner modules and avoid putting new main logic in broad facades.
- ECL 13.7 Core Mechanism Reuse / Architecture Growth Control requires cross-cutting artifact, lineage, stale revalidation, authority, ledger, projection, gate, and ToolPolicy behavior to live in shared owners rather than feature-local systems.
- ECL 15 Controlled Evolution requires proposal, independent review, validation, results logging, and `mark-complete`.
- ECL 16 Documentation Entropy and ECL 17 Experience Lifecycle prevent detailed per-phase examples from growing current docs when a general rule already exists.

## Independent Review

Subagent `019ede48-44c3-7120-b5e2-5560bb7fc643` returned PASS and recommended `keep / independent_review`.

The reviewer found no concrete missing Harness rule, template, lint, documentation, or product-runtime change. The reviewer specifically noted that the current process already caught scope issues, stale placeholders, review coverage gaps, and handoff alignment issues without needing a new rule.

## Experience Retention Scan

- Promote: none.
- Retain: Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, workflow-truth, ToolPolicyGate, and human-gate rules.
- Merge: summarize this window as maintenance helper/store/authority reuse strengthening existing owners and avoiding local mini-frameworks. Keep that merged lesson in this proposal/review only.
- Retire: no current rule or doc retirement required beyond normal stale active-handoff cleanup.
- Archive-only: detailed per-phase authority/store/Markdown/write-validation examples remain in archived summaries.

## Validation Plan

- Run Harness lint and encoding lint.
- Rebuild the change index.
- Run `harness-evolve mark-complete -Status keep -EvalMode independent_review`.
- Confirm `harness/evolution/pending.md` is removed and `harness-evolve check` reports no pending evolution.
