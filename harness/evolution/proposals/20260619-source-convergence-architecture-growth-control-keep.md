# Source Convergence Architecture Growth Control Harness Evolution Proposal

## Candidate Window

Pending trigger archives:

- `harness/changes/archive/20260619-maintenance-canonical-patch-lineage-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-target-boundary-reuse/summary.md`
- `harness/changes/archive/20260619-phase-12u-product-maintenance-canonical-patch-target-descriptors/summary.md`
- `harness/changes/archive/20260619-phase-12v-product-maintenance-canonical-patch-application-writer/summary.md`
- `harness/changes/archive/20260619-phase-12w-product-maintenance-canonical-patch-application-observation-report-evidence/summary.md`

Additional current evidence reviewed:

- `harness/changes/archive/20260619-maintenance-canonical-artifact-store-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-artifact-store-canonical-updates-adoption/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-ledger-idempotency-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-artifact-reference-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-ledger-event-policy-reuse/summary.md`

## Plan Review

Subagent `019edc99-cf8f-7fe3-8631-2940f9a832bb` recommended PASS before ECL creation, with corrections now applied:

- treat `pending.md` as a trigger snapshot, not the full evidence window;
- include later source-convergence archives;
- record handoff drift from the just-closed product change to active pending evolution;
- use `keep` only after independent review;
- scan both new-rule gaps and stale retained current memory;
- keep unrelated `README.md` untracked.

## Recommendation

Status: `keep`, pending independent evolution review.

The evidence shows the current rules are working. Product maintenance first added target descriptors, writer results, and observation reports under human gates and non-executing evidence boundaries. The following source-convergence changes then moved repeated target-boundary, lineage/alignment, artifact IO, ledger idempotency, artifact-reference, and ledger event-policy behavior into focused shared owners without changing Workbench, scheduler, Goal Loop, schema, source apply, or canonical rewrite authority.

Do not add a new ECL rule, template field, lint check, CI check, current-doc rule, product runtime behavior, Workbench action, or source change unless independent review finds an uncovered repeated gap.

## Experience Retention Scan

| Candidate lesson | Decision | Rationale |
| --- | --- | --- |
| New maintenance evidence phases must stay non-executing and human-gated | Retain | Existing workflow-truth, Proposal/Runtime, ToolPolicy/human-gate, Workbench honesty, and Source Apply Safety rules cover the boundary. |
| Evidence-only/report/manifest/descriptor phases can create local repeated mechanisms | Retain | Existing Architecture Growth Control / Core Mechanism Reuse already says to stop adding pure evidence phases unless they reuse a core mechanism and lower future cost. |
| Target path/hash/descriptor safety belongs in one owner | Archive-only for implementation details; retain current rule | The target-boundary archive proves the pattern; current docs already generalize it as shared artifact/lineage/stale-revalidation ownership. |
| Lineage and operation-alignment guards belong in one owner | Archive-only for implementation details; retain current rule | The lineage archive proves the pattern; current Core Mechanism Reuse and Module Boundary rules are sufficient. |
| Generic maintenance artifact IO belongs in a shared artifact store | Archive-only for implementation details; retain current rule | The artifact-store and canonical-updates adoption archives prove the pattern; no new Harness rule is needed. |
| Ledger idempotency by event type and primary artifact ref belongs in ledger ownership | Archive-only for implementation details; retain current rule | The ledger-idempotency archive proves the pattern; current ledger/event policy target in the architecture debt register covers future work. |
| Canonical artifactRefs assembly belongs in a shared helper | Archive-only for implementation details; retain current rule | The artifact-reference archive proves the pattern; current shared artifact owner guidance covers it. |
| Canonical maintenance evidence event classification belongs in ledger event policy | Archive-only for implementation details; retain current rule | The ledger-event-policy archive proves the pattern; `docs/CURRENT-DEVELOPMENT-PLAN.md` already names ledger and event policy as a convergence target. |
| Phase-specific 12U/12V/12W no-rewrite/no-action/no-candidate wording | Merge | The general workflow-truth, Proposal/Runtime, ToolPolicy/human-gate, Read Model Projection, and Architecture Growth Control rules cover the durable lesson. |
| Detailed source-convergence phase narratives | Archive-only | Useful audit history, but not current routing memory. |
| New durable Harness rule/template/lint | Promote: none currently | Current rules are sufficient and more general than the phase-specific lessons. |
| Stale active/pending handoff state after product close | Retire after final handoff | `AGENTS.md` and `docs/STATUS.md` are corrected to active auto-evolve/pending during this change and must be corrected again to no active/no pending after `mark-complete` and close. |
| Premature pending-completed wording in `docs/STATUS.md` while `pending.md` still exists | Retire immediately | Independent review found the baseline sentence still said pending evolution had completed as `keep`; that wording was replaced with active proposal / pending validation / `mark-complete` language before marking evolution complete. |

## Current Memory Scan

- `AGENTS.md`: should keep only current handoff, loading order, compact boundaries, and verification map. Do not add phase narratives.
- `docs/STATUS.md`: should stay a short handoff and archive lookup. During this active change it must say the `keep` proposal is pending validation and `mark-complete`, not already completed. Final state must clear active and pending paths.
- `docs/ECL.md`: existing Architecture Growth Control / Core Mechanism Reuse, Module Boundary, Documentation Entropy, Experience Lifecycle, Close/Handoff Drift, and Harness evolution rules are sufficient.
- `harness/templates/change/*`: no template gap found; current review template already contains coverage sections for documentation entropy, experience lifecycle, module boundary, core mechanism reuse, and handoff drift.
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: already records convergence before expansion and the architecture debt register, including ledger/event policy.
- Roadmap/product-loop docs: no new current-state wording is needed; detailed history remains archive-only unless a separate stale-doc change finds drift.

## Boundaries

- No product runtime behavior changes.
- No source-root, canonical docs, stable memory, ECL rule/template, Workbench action, apply/close, remote, or automatic Harness evolution behavior is changed.
- Pending evolution is completed only through proposal, independent review, validation, results.tsv, and `mark-complete`.
