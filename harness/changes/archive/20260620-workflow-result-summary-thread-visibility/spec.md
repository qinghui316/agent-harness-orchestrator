# Spec: workflow-result-summary-thread-visibility

## Goal

Make completed Workbench workflow actions display their existing user-facing result summary in the main thread read model, so controlled Scheduler stop handoffs are visible where the user reviews action outcomes.

`resultSummary` is a durable user-facing display snapshot only. It is not workflow truth, not evidence truth, not an authorization source, and not input to ToolPolicyGate, stale revalidation, scheduler continuation, apply, close, validation, or audit decisions.

## Users

- Users reviewing Workbench thread history after a workflow action completes.
- Agents preparing handoff from Workbench snapshots without needing to inspect decision history for the same user-facing outcome.

## Acceptance Criteria

- AC-001: Workflow completed/failed thread entries may carry an optional `resultSummary` and the thread read model prefers it for workflow item display.
- AC-002: Workflow action service computes the result summary once per action outcome and reuses the same value for the thread entry and decision summary.
- AC-003: Controlled Scheduler one-step completion shows the post-step stop/next-step handoff in the main Workbench thread, without exposing raw ids, artifact hashes, preflight ids, internal DTO markers, or stack/debug objects.
- AC-004: Old thread entries without `resultSummary` remain compatible and continue to render through existing fallback copy.
- AC-005: Verification includes targeted read-model/action tests and either real UI/browser validation when a stable route is available or a DOM render test plus review note explaining why browser validation was not stable for this slice.

## Non-Goals

- Add scheduler continuation, loop execution, auto-run, whole-wave dispatch, apply, close, merge, or Harness evolution automation.
- Promote Workbench thread logs into workflow truth or evidence truth.
- Change ordinary user/agent messages, accepted artifacts, validation/audit items, or non-workflow thread projection rules.
- Rework the Workbench test architecture or split large test files in this change.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution records.
- `resultSummary` must be optional across product and web types; older durable data must remain readable.
- Failure summaries must be user-readable and must not write raw error stacks, internal evidence ids, file paths, or debug objects into the main thread body.
- Keep the change in existing owner modules: Workbench action service, Workbench thread read model, and web type declarations only as needed.

## Risks

- Risk: thread log becomes a second projection truth. Mitigation: spec and tests keep `resultSummary` display-only and read-model-only.
- Risk: result copy drifts between decision history and thread item. Mitigation: compute once and reuse.
- Risk: internal implementation terms leak into the user thread. Mitigation: targeted negative assertions on raw ids/internal markers.
