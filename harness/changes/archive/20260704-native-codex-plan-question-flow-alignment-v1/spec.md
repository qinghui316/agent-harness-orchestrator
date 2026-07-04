# Spec: native-codex-plan-question-flow-alignment-v1

## Goal

Make planning-agent interaction feel like native Codex planning: main Agent talks in the center, delegates planning, and receives the result; planning-agent plan streaming, runtime questions, feedback, and revision history appear in the right Agent workspace.

## Users

Users working in AHO Workbench who expect a clear main Agent to child Agent flow without internal Harness implementation details in the main conversation.

## Acceptance Criteria

- AC-001: Main conversation shows only user messages, main Agent replies, and short delegation/return process rows; it does not show full planning text, acceptance lists, task lists, internal ids, or persistent waiting/connecting prose.
- AC-002: planning-agent uses Codex native Plan Mode as the main path; AHO does not require fixed AHO templates or `<proposed_plan>` output except as a marked fallback/replay path.
- AC-003: Codex plan delta, plan update, and completed plan content are displayed in the planning-agent workspace as plan transcript content, not generic "plan update" status rows.
- AC-004: Codex request-user-input prompts are scoped to the matching agent/run and are not Harness confirmation gates or canonical planning artifacts.
- AC-005: planning-agent feedback and "implement this plan" intent use the right workspace composer while existing confirm-execution target freshness and revalidation stay intact.
- AC-006: User-visible planning copy avoids internal terms such as Change, bundle, AC, tasks, TaskRun, WorkflowRun, and default "方案草案" wording on the primary surfaces.
- AC-007: Existing Harness authority boundaries remain unchanged: confirmationQueue, ToolPolicyGate, action registry, automation allowlist, Scheduler, IntegrationCheck, validation/audit, apply, and close are not expanded.
- AC-008: Real UI acceptance either proves native app-server plan/question streaming through the real App or records the runtime as blocked without fake output.

## Non-Goals

- Do not create a new workflow runtime, controller, permission model, or child-agent execution authority.
- Do not let planning-agent edit files, execute code, apply results, close changes, or recursively delegate.
- Do not replace Harness artifacts and gates with Codex thread state.

## Constraints

- Use existing transcript/workspace rendering wherever possible.
- Keep Codex app-server plan/request-user-input as runtime UI capability, not workflow truth.
- Preserve current planning.confirm-execution behavior and stale-target revalidation.
- Keep old snapshots unsupported for this test-stage UI path.

## Risks

- Codex app-server native Plan Mode may be unavailable in the local runtime; real acceptance must record blocked instead of faking a pass.
- Over-normalizing plan text into Harness planning bundles too early can reintroduce internal artifact leakage.
- Moving plan events out of generic status rows may require tests to distinguish runtime plan items from workflow evidence rows.
