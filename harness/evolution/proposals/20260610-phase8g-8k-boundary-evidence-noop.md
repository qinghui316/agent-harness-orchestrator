# Harness Evolution Proposal: Phase 8G-8K Boundary Evidence

## Decision

Status: `noop`
Evaluation mode: `subagent_review`

Phase 8G-8K does not require a new Harness rule, template, lint, or product
change. The repeated lessons are already covered by existing ECL sections and
review-template fields for scoped action payloads, proposal/runtime authority,
stale/forged/cross-change target behavior, close/handoff drift, and module
boundaries.

## Evidence Reviewed

- Phase 8G: selected-demand Spec-Test evidence status, drift, proposal, and
  generation scoping.
- Phase 8H: strict TaskQueue full typed-scope validation and TaskQueue domain
  boundary split.
- Phase 8I: DemandWorker domain boundary split.
- Phase 8J: TaskRun / WorkerLease scoped evidence matching and domain boundary
  split.
- Phase 8K: typed workflow artifact Change-scope guards and
  workflow-artifacts domain boundary split.

## Existing Coverage

- `docs/ECL.md` already requires scoped Workbench action payload coverage and
  stale/forged target evidence.
- `docs/ECL.md` already requires proposal/runtime authority classification and
  no-execution boundary evidence for planning/proposal/manifest/workflow
  artifacts.
- `docs/ECL.md` already requires module-boundary coverage when product code is
  split behind compatibility facades.
- `harness/templates/change/reviews/review.md` already has explicit sections
  for scoped action payloads, proposal/runtime boundaries, module boundaries,
  and close/handoff drift.

## Independent Review

Subagent review was user-authorized and read-only.

Recommendation: `noop`
Score: `90/100`

Summary:

- The pending window is exactly Phase 8G-8K.
- The observed issues are scoped target binding, stale/forged/cross-change
  fail-closed behavior, and module-boundary splits.
- Existing ECL and review-template coverage already matches these patterns.
- No exact rule gap was identified.

Limitations:

- The subagent reviewed Harness/ECL coverage only.
- It did not inspect source diffs or rerun tests.

## Validation Result

No Harness mutation is proposed. Validation should therefore confirm:

- pending evolution is marked complete through `scripts/harness-evolve.ps1
  mark-complete`;
- `harness/evolution/results.tsv` and `state.json` are updated by the script;
- `harness/evolution/pending.md` is removed;
- ECL lint, encoding lint, reindex, evolve check, and status checks pass.

## Follow-Up

Product modularization can continue after this Harness evolution closes. The
next product-code candidate is `Phase 8L: WorkflowRun Domain Boundary Split`,
followed by `change/manager.ts` if still useful.
