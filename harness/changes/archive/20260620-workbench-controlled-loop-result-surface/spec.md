# Spec: Workbench Controlled Loop Result Surface

## Goal

When a user confirms a controlled Goal Loop / Scheduler continuation, the Workbench should keep speaking in product language after the action finishes. The execution result, conversation thread, and replay fallback should say what happened in terms the user can act on: the system refreshed or checked the next step, advanced at most one confirmed step, stopped, and still requires separate confirmation for subsequent high-impact work.

Internal names such as `GoalLoopContinuationBrief`, `planning.scheduler.*`, concrete gate action types, scheduler loop mechanics, and evidence-only artifact titles may remain in artifact files and developer evidence, but they must not be the primary Workbench message shown to the user for this controlled-loop slice.

## Users

Users driving an AHO demand from the Workbench conversation and confirmation queue. They need to understand whether one step ran, whether the loop stopped, and what still needs confirmation without reading internal action ids.

## Acceptance Criteria

- AC-001: Controlled Scheduler step/advance result labels and summaries are user-facing and explicitly state one-step stop semantics without exposing raw action ids or internal loop mechanics.
- AC-002: Goal Loop evaluate/feedback/controller/preflight result labels and summaries are user-facing and explicitly state that no suggested/concrete step was executed unless separately confirmed.
- AC-003: Workbench thread workflow started/completed/failed fallback labels and bodies for the same action set use user-facing language.
- AC-004: Goal Loop handler assistant messages shown in the conversation thread are concise user-facing summaries with artifact references, not the full internal Markdown evidence body.
- AC-005: Focused tests cover the updated result summaries/labels, thread projection fallback, and at least one actual Goal Loop action message path, including negative assertions for internal terminology.
- AC-006: The implementation reuses or strengthens the existing Workbench user-surface copy boundary instead of introducing feature-local presentation frameworks or changing runtime authority.

## Non-Goals

- Implementing a broader autonomous loop, whole-wave scheduler dispatch, slot allocator, or automatic next-step execution.
- Changing Goal Loop evidence generation, Scheduler runtime transitions, validation/audit, IntegrationCheck, apply/close, remote landing, or Harness evolution gates.
- Rewriting historical artifacts or reference docs.
- Running full slow release verification by default if targeted Workbench/product checks cover the touched boundary.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution records.
- Workbench user-facing copy must not imply hidden execution authority.
- Feature logic must stay in Workbench user-surface/action/projection owners; no business rules may move into frontend glue or facade code.
- Detailed evidence artifacts may keep internal terms; the primary Workbench conversation/result copy must be user-facing.

## Risks

- Over-sanitizing evidence could hide important traceability. Mitigation: only primary message/result copy changes; artifacts remain linked.
- Duplicating user-facing text could create drift. Mitigation: add a small shared copy helper and reuse the existing scheduler user-surface copy owner for scheduler labels.
- Accidentally changing runtime semantics while touching result surfaces. Mitigation: no handler execution branches or scheduler/goal-loop compile logic changes.

