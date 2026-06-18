# Maintenance Canonical Chain Harness Evolution Proposal

## Candidate Window

Pending trigger archives:

- `harness/changes/archive/20260619-phase-12u-product-maintenance-canonical-patch-target-descriptors/summary.md`
- `harness/changes/archive/20260619-phase-12v-product-maintenance-canonical-patch-application-writer/summary.md`
- `harness/changes/archive/20260619-phase-12w-product-maintenance-canonical-patch-application-observation-report-evidence/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-target-boundary-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-lineage-reuse/summary.md`

Additional current evidence reviewed:

- `harness/changes/archive/20260619-maintenance-canonical-ledger-idempotency-reuse/summary.md`

## Independent Review

Subagent `019edc23-8a92-7e62-9cf0-3d89cf28c52b` recommended PASS for a `keep` result with no new durable Harness rule, template, lint check, or docs rule.

The review found that existing current rules already cover the observed lessons:

- Architecture Growth Control / Core Mechanism Reuse
- Module Boundary
- Documentation Entropy
- Experience Lifecycle
- ToolPolicy, human-gate, and workflow-truth boundaries

Corrections from the review were applied before implementation: active ECL placeholders were filled, handoff drift was corrected, the ledger-idempotency archive was included as additional evidence, the result semantics were documented as `keep`, and review coverage marks Documentation Entropy, Experience Lifecycle, Module Boundary, and Core Mechanism Reuse applicable.

## Recommendation

Status: `keep`

Keep existing current rules as sufficient durable Harness memory. Do not add a new ECL rule, template field, lint check, CI check, current-doc rule, product runtime behavior, Workbench action, or source change.

The evidence shows the current rules are working: after product maintenance phases added target descriptors, writer results, and observation reports, follow-up source convergence changes moved repeated target-boundary, lineage/alignment, and ledger-idempotency behavior into shared owners.

## Experience Retention Scan

| Candidate lesson | Decision | Rationale |
| --- | --- | --- |
| Product maintenance canonical patch phases require ToolPolicyGate, stale target revalidation, human confirmation, and non-executing evidence boundaries | Retain | Existing product boundaries, ToolPolicy/human-gate rules, Proposal/Runtime Boundary, and Source Apply Safety cover this. |
| New maintenance evidence phases can create repeated local mechanisms if not followed by source convergence | Retain | Existing Architecture Growth Control / Core Mechanism Reuse explicitly tells future agents to reuse shared owners before adding more evidence-only phases. |
| Target path/hash/descriptor safety belongs in a shared owner | Archive-only for details; retain current rule | The target-boundary source convergence archive proves the pattern, while the general owner/reuse rule already lives in current docs. |
| Lineage and operation-alignment guards belong in a shared owner | Archive-only for details; retain current rule | The lineage archive proves the pattern; no new rule is needed beyond current Core Mechanism Reuse and Module Boundary coverage. |
| Ledger idempotency by event type and primary artifact ref belongs in the ledger owner | Archive-only for details; retain current rule | The ledger-idempotency archive proves the pattern; no new Harness rule is needed. |
| Phase-specific 12U/12V/12W no-rewrite, no-action, no-candidate, no-gate wording | Merge | Already merged into broader workflow-truth, Proposal/Runtime, ToolPolicy/human-gate, and Architecture Growth Control rules. Do not copy phase wording into current docs. |
| Detailed Phase 12U/12V/12W and source convergence implementation narratives | Archive-only | Useful audit history, not current routing memory. |
| New durable Harness rule/template/lint | Promote: none | Existing rules are sufficient and more general. |
| Stale current-doc history from this window | Retire: none found | `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` already point to compact current direction rather than copying phase narratives. |

## Documentation Entropy

No current docs are expanded for this evolution beyond active/handoff state. The evolution deliberately avoids adding another overlapping rule because current ECL and handoff docs already contain the reusable constraint.

## Boundaries

- No product runtime behavior changes.
- No source-root, canonical docs, stable memory, ECL rule/template, Workbench action, apply/close, remote, or automatic Harness evolution behavior is changed.
- Pending evolution is completed only through proposal, independent review, validation, results.tsv, and `mark-complete`.
