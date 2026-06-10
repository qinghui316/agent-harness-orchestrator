# Phase 8K-8O Boundary Evidence Evolution Proposal

## Recommendation

`noop/dry_run`

No new Harness rule is required for the Phase 8K-8O window.

## Evidence Reviewed

- Phase 8K: workflow artifact Change-scope guards and workflow-artifacts facade split.
- Phase 8L: WorkflowRun Change, queue, and event scope guards plus workflow-run facade split.
- Phase 8M: Change lifecycle metadata guards plus change manager facade split.
- Phase 8N: Run evidence manager facade split.
- Phase 8O: Worktree metadata id/project/checkout-root guards plus worktree facade split.

## Rationale

The candidate archives repeat an already covered pattern: scoped evidence or metadata must prove ownership before projection, mutation, resume, or execution paths trust it, and manager internals should move behind compatibility facades with boundary tests.

Existing ECL coverage is sufficient:

- Module-boundary review already requires module owners, moved responsibilities, retained facade responsibilities, forbidden reverse dependencies, compatibility results, and tests.
- Close/handoff drift review already requires active path, archive path, pending evolution, and STATUS/AGENTS alignment checks.
- Proposal/runtime boundary review already separates proposal, guardrail verdict, execution input, runtime evidence, and workflow truth.
- Source/apply and scoped evidence guard patterns already cover fail-closed behavior for misplaced or forged facts.

The useful next product-code candidate remains a scoped Validation / Audit evidence boundary split, but that is implementation work and should not be bundled into this Harness evolution.

## Validation

This proposal should be accepted as `noop` with `EvalMode=dry_run` because no subagent review was explicitly authorized for this execution.
