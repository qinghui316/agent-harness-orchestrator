# Spec: Phase 8R Future Feature Module Boundary Rule

## Goal

Make the repository's long-term module-boundary rule explicit and reusable for future feature work. Future product changes must declare the owner module for new behavior, keep broad compatibility facades thin, and record tests or review evidence that the implementation did not reintroduce mixed large-file ownership.

## Users

- Future agents implementing AHO product features.
- Maintainers reviewing ECL changes and module-boundary risks.
- The product owner, who wants future workflow/scheduler/subagent features to remain easy to change and audit.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8Q closed and Phase 8R active.
- AC-002: ECL contains a long-term Future Feature Module Boundary Rule.
- AC-003: Future product features must declare owner module before implementation.
- AC-004: Compatibility facades are explicitly limited to thin entry, export, composition, dependency-injection, and dispatch responsibilities.
- AC-005: Main implementation logic is explicitly directed to owned modules.
- AC-006: Change templates require owner module, retained facade responsibility, forbidden write-back locations, compatibility surface, and boundary tests.
- AC-007: `docs/BOUNDARIES.md` lists default facade / shell files that should not receive new main implementation logic.
- AC-008: `lint-ecl.ps1` checks rule presence only, not heuristic applicability or line count.
- AC-009: No product runtime, Workbench, CLI, route, action, UI, scheduler, parallel execution, child Change creation, ODWF JS runtime, or cache/replay behavior changes.
- AC-010: Harness verification passes.
- AC-011: Product verification passes, or any pre-existing failure is clearly recorded.
- AC-012: `README.md` remains unrelated and untracked.

## Non-Goals

- Do not continue broad product-code modularization.
- Do not add or change product behavior.
- Do not add fragile lint logic that tries to infer module-boundary applicability from diffs or line count.
- Do not make file size alone a lint failure.
- Do not require every documentation-only or Harness-only change to claim module-boundary applicability.

## Constraints

- Phase 8R is a Harness hardening phase, not a product implementation phase.
- Module-boundary applicability remains a review/template responsibility.
- Facades remain allowed for compatibility exports, thin composition, dependency injection wiring, route/action dispatch, and backwards-compatible entrypoints.
- `README.md` is an unrelated untracked file and must not be included.

## Risks

- Overly strict lint could block legitimate docs-only or Harness-only changes. Mitigation: keep lint to rule-presence checks.
- Overly broad wording could cause pointless file splitting. Mitigation: keep "file size alone is not a failure condition."
- Future agents may still ignore template guidance. Mitigation: record explicit review fields and retain existing module-boundary tests.
