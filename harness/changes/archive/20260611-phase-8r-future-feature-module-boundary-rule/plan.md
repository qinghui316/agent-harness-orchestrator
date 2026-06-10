# Plan: Phase 8R Future Feature Module Boundary Rule

## Approach

Make the smallest Harness-only change that prevents future feature work from drifting back into broad facades. Update ECL and boundary docs first, then update templates, then add only a lightweight lint presence check. Avoid product code edits and avoid line-count heuristics.

## Steps

1. Repair handoff language in `AGENTS.md` and `docs/STATUS.md` so Phase 8R is active and Phase 8Q is archived.
2. Update `docs/ECL.md` section `13.6 Module Boundary Coverage` with the Future Feature Module Boundary Rule.
3. Update `docs/BOUNDARIES.md` with default facade/shell files and the "owned modules first" rule.
4. Update `harness/templates/change/plan.md` with a `Module Boundary Plan` section.
5. Update `harness/templates/change/reviews/review.md` to require owner module, retained facade responsibility, forbidden write-back locations, compatibility surface, behavior test, and not-applicable reason.
6. Update `scripts/lint-ecl.ps1` to check only for rule wording in `docs/ECL.md`.
7. Run drift checks, Harness verification, and product verification.
8. Update active change review/summary/tasks with actual verification results.

## Decisions

- Module-boundary applicability stays in human/agent review instead of brittle static lint.
- Compatibility facades remain valid when they are thin entrypoints, exports, composition points, dependency-injection wiring, or route/action dispatchers.
- File size remains a review signal only.
- The next product-code track after this Harness rule hardening is Parallel TaskGraph Readiness / Scheduler Contract Foundation.

## Module Boundary Plan

- Owner module: Harness/ECL rule and template layer.
- New / moved responsibilities: long-term future-feature module-boundary rule, template checklist, and lint keyword presence check.
- Facade touch points: none in product code.
- Forbidden write-back locations: product compatibility facades such as `chat.ts`, `manager.ts`, `App.tsx`, `workbench-server.ts`, `code-workflow.ts`, `program.ts`, `types/index.ts`, and domain `manager.ts` files are documented as default non-owners for future main implementation logic.
- Compatibility surface: no product public API, Workbench, route, CLI, artifact, or runtime shape changes.
- Boundary tests: existing `tests/unit/workbench-module-boundaries.test.ts` remains the product-code mechanical guard; this phase verifies docs/templates/lint changes.
- Follow-up split candidates: none. Future changes should be feature-driven.

## Planning-Discovered Gaps

None.
