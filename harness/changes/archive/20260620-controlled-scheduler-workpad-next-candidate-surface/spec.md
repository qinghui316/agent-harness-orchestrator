# Spec: controlled-scheduler-workpad-next-candidate-surface

## Goal

After a user confirms one controlled Scheduler advance, the Workbench should keep showing the refreshed next-step candidate in the Workpad Goal Loop details, not only in the transient thread result summary.

The surface must explain whether the next candidate is ready for a fresh confirmation or needs review, using user-facing language backed by fresh Goal Loop/controller/preflight evidence.

## Users

- Human operator deciding whether to continue the next controlled Scheduler step.
- Main Agent / Workbench UI relying on the Workpad read model for non-executing handoff state.

## Acceptance Criteria

- AC-001: Workbench Goal Loop read model exposes a compact controlled Scheduler next-candidate DTO only when the latest GoalLoopDecision, iteration, continuation brief, next-step packet, and optional controller/preflight evidence pass existing lineage and freshness checks.
- AC-002: The DTO states the candidate status, user-facing step label, body text, readiness evidence state, human-confirmation requirement, and evidence refs without exposing raw action ids or internal workflow terms.
- AC-003: The Workpad Goal Loop evidence card renders the DTO as read-only state and does not add an action, duplicate the right confirmation queue, or imply automatic continuation.
- AC-004: Missing, stale, or lineage-mismatched controller/preflight evidence must degrade to "needs review" or omit readiness evidence, not invent a ready candidate.
- AC-005: Verification includes projection tests and a real React/App DOM test proving the Workpad UI shows the next-candidate text and does not leak raw action ids/internal terms or render an execution button in the card.

## Non-Goals

- Do not add a new workflow action, route, ToolPolicy path, runtime loop, automatic parallel dispatch, slot allocator, source apply, close, merge, remote landing, or Harness evolution automation.
- Do not treat transient `postStepHandoff` action results as Workpad truth.
- Do not refactor the broader `GoalLoopCards.tsx` label fallback logic in this change.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- The Workpad field must be derived in the read-model / user-surface owner layer. React should render fields, not recalculate Goal Loop freshness or Scheduler gate readiness.
- Existing public Workbench payload compatibility must be preserved by adding optional fields only.

## Risks

- Overstating readiness could imply an automatic loop. The copy and DTO must explicitly preserve separate human confirmation and non-execution.
- Putting logic in React would add another local projection. The owner must stay in read-model/user-surface code.
- Projection-only validation would miss UI regressions. This change requires real DOM validation.
