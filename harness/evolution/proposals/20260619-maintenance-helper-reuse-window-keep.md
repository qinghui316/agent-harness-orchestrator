# Maintenance Helper Reuse Window Harness Evolution Proposal

## Candidate Window

Pending trigger archives:

- `harness/changes/archive/20260619-maintenance-canonical-patch-application-authority-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-store-backed-artifact-lookup-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-canonical-patch-target-descriptor-render-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-markdown-list-helper-reuse/summary.md`
- `harness/changes/archive/20260619-maintenance-markdown-evidence-list-renderer-reuse/summary.md`

## Independent Review

Subagent `019ede0f-d4d2-7802-955b-0bca6541d57d` recommended PASS for a `keep` result.

The review found that the five candidates are repeated examples of existing Core Mechanism Reuse / Architecture Growth Control and Module Boundary rules working as intended, not evidence of a missing durable rule. It required the proposal/review to scope Experience Retention across `AGENTS.md`, `docs/STATUS.md`, `docs/ECL.md`, templates if relevant, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/AGENT-DEVELOPMENT-OS.md`; record Documentation Entropy line counts and stale-current-state checks; retire stale active-product handoff wording; and run `mark-complete` only after proposal, review, and validation.

## Recommendation

Status: `keep`

Keep existing current rules as sufficient durable Harness memory. Do not add a new ECL rule, template field, lint check, CI check, current-doc rule, product runtime behavior, Workbench action, source change, or reference-source change.

The evidence shows the current rules are working: repeated authority flags, store-backed lookups, target descriptor display, and markdown Evidence list rendering were consolidated into shared owners through small structured changes with explicit module-boundary and core-mechanism reuse coverage.

## Experience Retention Scan

Scope checked:

- `AGENTS.md`
- `docs/STATUS.md`
- `docs/ECL.md`
- `harness/templates/change/`
- `docs/CURRENT-DEVELOPMENT-PLAN.md`
- `docs/AGENT-DEVELOPMENT-OS.md`

| Candidate lesson | Decision | Rationale |
| --- | --- | --- |
| Repeated maintenance authority flags belong in a focused authority owner | Archive-only for details; retain current rule | The application-authority helper archive proves the pattern. The general owner/reuse rule already lives in `AGENTS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/ECL.md` Core Mechanism Reuse coverage. |
| Repeated store-backed artifact lookup belongs in the artifact-store owner | Archive-only for details; retain current rule | The store lookup archive proves the pattern. No new Harness rule is needed beyond current Module Boundary and Core Mechanism Reuse rules. |
| Repeated target descriptor display belongs in the target-boundary owner | Archive-only for details; retain current rule | The descriptor formatter archive proves the pattern. The existing rule already says cross-cutting artifact/lineage/authority/projection/gate logic belongs in shared owners. |
| Repeated markdown Evidence list rendering belongs in the maintenance markdown owner | Archive-only for details; retain current rule | The two markdown helper archives prove incremental convergence into a presentation-only owner. Implementation details should not be copied into ECL. |
| Small helper-reuse slices should continue to avoid Workbench, Scheduler, Goal Loop, ToolPolicy, source mutation, schema, ledger, and manager-facade scope expansion | Retain | Existing Product Boundaries, Module Boundary, Core Mechanism Reuse, ToolPolicy/human-gate, and workflow-truth rules cover this. |
| Multiple helper-reuse lessons should become separate new current rules | Merge | The lessons merge into the already-current Architecture Growth Control / Core Mechanism Reuse and Module Boundary rules. |
| Stale active product handoff after the product close | Retire | `AGENTS.md` and `docs/STATUS.md` temporarily pointed to the just-closed product change until this auto-evolve handoff took over. Final close cleanup must remove active product paths and point to the latest archives. |
| Detailed per-change validation narratives and implementation choices | Archive-only | Durable audit history belongs in archived summaries and this proposal, not in current entry/handoff docs. |
| New durable Harness rule/template/lint | Promote: none | Existing rules are sufficient, current, and more general. |

## Documentation Entropy

Line counts before proposal close:

- `AGENTS.md`: 145
- `docs/STATUS.md`: 99
- `docs/ECL.md`: 449
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: 72
- `docs/AGENT-DEVELOPMENT-OS.md`: 212
- `harness/templates/change/`: 5 files

Stale-current-state scan:

- `AGENTS.md` and `docs/STATUS.md` currently point to this active auto-evolve change and pending evolution, as expected while this change is active.
- `docs/CURRENT-DEVELOPMENT-PLAN.md` remains the current roadmap authority and still routes future product work through Architecture Growth Control.
- `docs/AGENT-DEVELOPMENT-OS.md` explicitly labels older baselines and directions as historical and points future phase selection back to `docs/CURRENT-DEVELOPMENT-PLAN.md`, latest archived summaries, and relevant architecture/runtime/workbench docs.
- `docs/ECL.md` and the change templates already contain Documentation Entropy, Experience Lifecycle, Module Boundary, Close/Handoff Drift, and Core Mechanism Reuse coverage. No additional template fields are needed.

No current docs are expanded with helper-reuse implementation details. Final close should add only the latest archive pointers and remove active/pending state.

## Boundaries

- No product runtime behavior changes.
- No source-root, canonical docs, stable memory, ECL rule/template, Workbench action, Scheduler, Goal Loop, ToolPolicyGate, human gate, apply/close behavior, remote behavior, reference source, or README change.
- Pending evolution is completed only through proposal, independent review, validation, results.tsv, state update, and `mark-complete`.
