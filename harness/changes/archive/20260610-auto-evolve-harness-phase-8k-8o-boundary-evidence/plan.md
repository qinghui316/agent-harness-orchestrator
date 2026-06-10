# Plan: Auto Evolve Harness Phase 8K 8O Boundary Evidence

1. Record the current pending window and dirty state.
2. Read Phase 8K-8O archive summaries and compare their evidence against existing ECL module-boundary, handoff-drift, proposal/runtime, source/apply, and scoped-evidence rules.
3. Write an evolution proposal under `harness/evolution/proposals/` with a `noop/dry_run` recommendation.
4. Update `reviews/review.md` with dry-run review findings, limitations, and validation notes.
5. Run `scripts/harness-evolve.ps1 mark-complete -Status noop -EvalMode dry_run`.
6. Repair post-mark-complete handoff docs so active change and pending evolution state are accurate.
7. Run Harness verification and close the structured change if ready.
