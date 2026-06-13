# Plan: Auto Evolve Harness Phase 9R 9V Scheduler Integration Apply Evidence

## Approach

Review the five candidate archive summaries and relevant boundary docs. Treat the Phase 9V direct-call candidate guard as product-code evidence: it proves owner modules need direct guards in addition to Workbench stale revalidation, but that requirement is already covered by scoped evidence guard, Source Apply Safety coverage, and future feature module-boundary review fields.

Use the authorized subagent review as the independent evaluation. If it finds no new durable rule gap, record `noop/subagent_review` and mark the pending evolution complete.

## Steps

1. Inspect pending window and current Harness rules/templates.
2. Spawn an independent subagent to score and recommend noop/modify/defer.
3. Write `harness/evolution/proposals/20260613-phase9r-9v-scheduler-integration-apply-evidence-noop.md`.
4. If the subagent recommends a small rule change, implement it; otherwise keep noop.
5. Run Harness verification.
6. Run `harness-evolve.ps1 mark-complete`.
7. Update docs handoff, close the auto-evolve change, and commit with Phase 9V.

## Decisions

- Default result: `noop/subagent_review`.
- No product code changes in this auto-evolve phase.
- No new static heuristic unless subagent evidence clearly justifies it.

## Module Boundary Plan

- Owner module: not applicable; Harness evidence phase only.
- New / moved responsibilities: none.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench facades, server, web UI, CLI.
- Compatibility surface: Harness change/evolution workflow only.
- Boundary tests: `lint-ecl`, `lint-encoding`, `harness-change reindex`, `harness-evolve check/status`.
- Follow-up split candidates: none.
- If not applicable, reason: no product module implementation.

## Planning-Discovered Gaps

None yet. Awaiting independent subagent review.
