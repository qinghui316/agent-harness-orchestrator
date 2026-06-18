# Phase 12O-12S Harness Evolution Proposal

## Candidate Window

- `harness/changes/archive/20260618-phase-12o-product-maintenance-candidate-lifecycle-resolution/summary.md`
- `harness/changes/archive/20260618-phase-12p-product-maintenance-canonical-update-proposal-evidence/summary.md`
- `harness/changes/archive/20260618-phase-12q-product-maintenance-canonical-update-decision-gate/summary.md`
- `harness/changes/archive/20260618-phase-12r-product-maintenance-canonical-patch-proposal-evidence/summary.md`
- `harness/changes/archive/20260618-phase-12s-product-maintenance-canonical-patch-application-gate/summary.md`

## Scan

The window completes the first product-maintenance evidence chain from scored candidates to lifecycle resolution, canonical update proposal, human decision record, canonical patch proposal, and human-gated patch application follow-up record.

Existing Harness rules already cover the reusable lessons:

- Documentation Entropy and Experience Lifecycle require current docs to stay compact and classify old experience before retaining it.
- Close/Handoff Drift requires active/latest/pending state alignment across handoff docs.
- Scoped Workbench Action Payload, Read Model Projection, Proposal/Runtime Boundary, Module Boundary, and ToolPolicy/human-gate rules already cover the product-maintenance action and evidence boundaries.

One current-doc correction remains useful: handoff and current-plan wording must stop saying the baseline is post-Phase-12R/no-pending or that no canonical patch application path exists at all. The accurate post-Phase-12S wording is that a conservative human-gated patch application follow-up gate record exists, while deterministic canonical rewrite/application behavior remains future work.

## Recommendation

Status: `keep`

Keep the smallest current-doc correction:

- update handoff docs to post-Phase-12S and pending evolution state;
- update current-plan wording from post-Phase-12R/no-pending/future application path to post-Phase-12S, with human-gated patch application follow-up records implemented and deterministic canonical rewrite still future-only;
- keep detailed Phase 12O-12S implementation and validation history archive-only.

Do not add new Harness rules, templates, lint checks, or product runtime behavior.

## Experience Retention Scan

| Candidate lesson | Decision | Rationale |
| --- | --- | --- |
| Product maintenance canonical transitions must keep authority conservative and explicit | Retain | Product code/tests now encode false source/canonical/execution authority flags; current docs should mention the boundary compactly. |
| Maintenance canonical evidence must remain non-executing and separate from automatic rewrites | Retain | Existing Proposal/Runtime, ToolPolicy/human-gate, and product-boundary docs cover this; no new Harness rule needed. |
| Project-scoped maintenance actions should not route through the demand workflow service | Retain | Phase 12S fixed this in product code/tests; it is a module-boundary lesson, not a generic Harness rule gap. |
| Maintenance canonical ledger events should not feed maintenance candidate generation | Retain | Phase 12S product tests protect the self-feedback boundary; archive detail is sufficient. |
| Stale post-Phase-12R/no-pending/current application-missing wording | Retire | Superseded by Phase 12S archive and this evolution completion. |
| Multiple maintenance phases describing proposal/decision/patch evidence separately | Merge | Current docs should summarize the chain once as product-maintenance evidence, with details in archive summaries. |
| Exact implementation file names, test names, artifact internals, and phase-by-phase narrative | Archive-only | Useful audit history but not current agent routing guidance. |
| New generic ECL/Harness process rule | Promote: none | Existing rules already require the relevant review, boundary, entropy, and handoff checks. |

## Boundaries

- No source runtime, stable memory, canonical docs, ECL rule/template, apply/close, remote, or automatic Harness evolution behavior is changed.
- Human confirmation remains required for high-impact canonical transitions.
- The patch application follow-up gate is evidence for later application work; it is not a deterministic canonical rewrite executor.
