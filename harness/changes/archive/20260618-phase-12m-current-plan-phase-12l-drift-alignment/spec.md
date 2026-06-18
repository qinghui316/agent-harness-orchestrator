# Spec: Phase 12M Current Plan Phase 12L Drift Alignment

## Goal

Keep the current roadmap handoff consistent after Phase 12L. `docs/CURRENT-DEVELOPMENT-PLAN.md` must not tell future agents that the product baseline is still post-Phase-12K when `AGENTS.md`, `docs/STATUS.md`, and archive evidence show Phase 12L is the latest product change.

## Users

- Future agents choosing the next AHO implementation slice.
- Maintainers reviewing current product direction without reading the full archive ledger.

## Acceptance Criteria

- AC-001: `docs/CURRENT-DEVELOPMENT-PLAN.md` says the current product baseline is post-Phase-12L.
- AC-002: The current plan records a minimal Phase 12L note: SchedulerRun terminal Workpad completion and blocked-closeout cards are read-only evidence and do not authorize scheduler loop, full executor, dispatch, slot allocation, source mutation, apply, close, merge, or Harness evolution.
- AC-003: The update does not copy Phase 12L archive narrative into current docs or expand product scope.
- AC-004: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and the Phase 12L archive agree on latest baseline / next-direction state before close.

## Non-Goals

- No product code, UI, runtime, scheduler, Goal Loop, action registry, schema, bridge, test, or Harness evolution change.
- No rewrite of the full long roadmap paragraph beyond the stale-current-state correction.
- No promotion of archived implementation details into current docs.

## Constraints

- Current docs remain compact derived memory; archive summaries own detailed history.
- Phase 12A controlled scheduler loop remains future-only.
- Goal Loop and scheduler evidence remain non-executing and cannot bypass ToolPolicyGate or human gates.
- The change must follow ECL active-change, review, handoff, close, and verification rules.

## Risks

- Documentation churn can grow current docs. Mitigation: update one stale current-state sentence and keep Phase 12L as one compact current behavior clause.
- A baseline update can accidentally imply runtime authorization. Mitigation: explicitly preserve false-authority language.
- Closing a doc-only change can drift handoff docs again. Mitigation: run stale phrase grep and ECL status/lint after close.
