# Spec: controlled-scheduler-action-receipt-surface

## Goal

When a user confirms a controlled Scheduler advance, the Workbench should show a clear receipt as soon as the live action stream emits the completed workflow message. The receipt should say which single step completed, what the next candidate category is when available, whether the next check is ready or needs review, and that another human confirmation is still required.

This closes the gap where the backend already writes a safe `resultSummary`, but the frontend live stream ignores terminal workflow messages until the final snapshot projection arrives.

## Users

- A developer using the Workbench to continue a Goal Loop / controlled Scheduler flow one confirmed step at a time.
- The main agent and later reviewers reading Workbench thread evidence to understand whether a confirmed step completed and what remains gated.

## Acceptance Criteria

- AC-001: Live workflow terminal receipt: when a live `topic.message` contains `workflow.completed` or `workflow.failed`, the frontend displays a workflow/evidence receipt immediately, before the final snapshot event is applied.
- AC-002: Controlled Scheduler clarity: for `planning.scheduler.controlled-advance.run`, the receipt uses the existing result summary text that includes the completed step category, next candidate category when available, stop/confirmation language, and no automatic continuation claim.
- AC-003: Authority boundary: the live receipt is not rendered as Codex assistant markdown, does not create or duplicate confirmation buttons, and does not become a source of workflow actions.
- AC-004: User-surface honesty: the receipt and DOM tests do not expose raw internal action ids or fake future capabilities such as automatic loop, whole-wave dispatch, start-all, slot allocation, full executor, or SchedulerRun authority.
- AC-005: Existing confirmation candidate behavior remains compatible: right-side controlled Scheduler candidate details continue to be passive copy derived from the confirmation queue/read model.

## Non-Goals

- No scheduler runtime changes.
- No new Goal Loop evaluation, controller, preflight, or handoff artifact type.
- No changes to ToolPolicyGate, stale revalidation, or action target validation.
- No new confirmation queue derivation from live-only state.
- No default conversation transcript synthesis that pretends AHO workflow evidence is Codex assistant text.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close decisions, and Harness evolution records.
- Controlled Scheduler remains one confirmed legal transition per high-impact action.
- Live UI may show workflow/evidence receipts, but the canonical post-action state remains the snapshot/read-model projection.
- New behavior must reuse existing `resultSummary`, `summarizeActionResult`, thread item shapes, and frontend rendering paths rather than adding a local receipt framework.

## Risks

- Risk: displaying workflow receipts in the live timeline could be mistaken for Codex assistant output. Mitigation: render as `source: "workflow"` / workflow receipt content, not `assistant.message`.
- Risk: the live receipt could duplicate after snapshot replacement. Mitigation: snapshot event clears live items, and tests should assert the final visible surface is not duplicated.
- Risk: adding live display logic could accidentally expose raw internal terms. Mitigation: DOM assertions check forbidden terms/actions.
