# Plan: Auto Evolve Harness Phase 10H 10L Goal Loop Packet Freshness Evidence

## Approach

Evaluate the archived Goal Loop evidence window against current Harness rules. Prefer `noop` if the existing Goal Loop Boundary, module-boundary, projection coverage, and ToolPolicy/human-gate rules are sufficient. Apply a minimal docs/template-only modification only if the review proves that future packet/context work needs explicit freshness coverage.

## Steps

1. Inspect pending evolution and candidate archive summaries.
2. Inspect current Goal Loop boundary docs, review template, and lint coverage.
3. Request independent subagent review with a focused question about packet freshness / stale context coverage.
4. Write an evolution proposal with recommendation, score/mode, evidence, limitations, and validation.
5. If accepted as modify, update only Harness docs/templates/lint needed for the durable rule.
6. Run Harness verification.
7. Run `harness-evolve.ps1 mark-complete` with the actual status/eval mode.
8. Update AGENTS.md and docs/STATUS.md after mark-complete and close/archive the evolution change.

## Decisions

- Treat this as Harness evolution, not product runtime work.
- Do not change product source unless the independent review identifies a product defect outside the already closed Phase 10L scope; that would require a separate product change.
- Do not label the result `subagent_review` unless a subagent actually completes with a recommendation.

## Module Boundary Plan

- Owner module: not applicable for product code; this is a Harness docs/template evolution.
- New / moved responsibilities: possible review-template wording only, pending independent review.
- Facade touch points: none.
- Forbidden write-back locations: product source, Workbench facades, server routes, frontend shell, scheduler/runtime modules.
- Compatibility surface: no product public interface changes.
- Boundary tests: Harness lint / encoding / reindex / evolve check.
- Follow-up split candidates: none.
- If not applicable, reason: this change does not add or move product implementation responsibilities.

## Planning-Discovered Gaps

Initial local review found that `docs/ECL.md` already contains Goal Loop recommendation authority and fallback-priority coverage, while `docs/BOUNDARIES.md` already records the Phase 10L packet freshness boundary. The open question is whether that freshness boundary should be lifted into the reusable review template so future Goal Loop packet/context changes must explicitly check stale-context suppression.
