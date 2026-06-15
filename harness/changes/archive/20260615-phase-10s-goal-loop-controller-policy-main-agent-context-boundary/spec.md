# Spec: Phase 10S Goal Loop Controller Policy Main Agent Context Boundary

## Goal

Make the latest valid `GoalLoopControllerPolicy` available to the main Agent as prompt context, so the main Agent can explain whether the current Goal Loop recommendation should be used, suppressed, blocked, or refreshed before the user confirms a concrete Harness gate.

The policy remains evidence only. It does not create or authorize any transition.

## Users

- Developer using the Workbench main conversation to continue a long-running Change.
- Main Agent composing the next response from current Change evidence, current Workpad gate, and non-executing Goal Loop context.

## Acceptance Criteria

- AC-001: Main-Agent context includes controller policy id, verdict, gate status, summary, artifacts, checklist, and forbidden execution statements when the latest policy strictly matches the latest decision / iteration / brief / packet lineage.
- AC-002: Stale, mismatched, cross-lineage, or `executionStarted !== false` controller policy is omitted from prompt context without hiding an otherwise valid next-step packet.
- AC-003: Existing packet freshness behavior remains unchanged; stale packets still suppress the whole Goal Loop context.
- AC-004: Workbench visible context does not expose a controller policy unless the selected Workpad projection exposes the same valid policy for the current visible packet.
- AC-005: No new Workbench action, HTTP route, CLI command, frontend control, lazy projection, scheduler runtime, worker start, source mutation, or child Change is introduced.
- AC-006: Goal Loop context clearly states that the controller policy is prompt context / evidence only and that concrete transitions still require their own scoped Harness gate, ToolPolicyGate, and human confirmation.
- AC-007: New logic stays in the owned `src/goal-loop` module, with Workbench codex-chat code acting only as visibility filtering / context wiring.

## Non-Goals

- Do not execute or confirm `GoalLoopControllerPolicy.recommendedAction`.
- Do not make controller policy workflow truth.
- Do not change current Workbench confirmation queue semantics.
- Do not inject this policy into worker role prompts.
- Do not alter scheduler, validation, audit, IntegrationCheck, apply, close, landing, PR, or merge behavior.

## Constraints

- Preserve Change/ECL, accepted artifacts, Run/Validation/Audit, IntegrationCheck, Apply/Close human gates as workflow truth.
- Preserve Goal Loop as non-executing evidence.
- Keep compatibility exports through `src/goal-loop/manager.ts`.
- Continue excluding unrelated untracked `README.md`.

## Risks

- The main Agent could over-trust controller verdict text. Mitigation: render explicit non-execution warnings and concrete-gate requirements.
- A stale policy could be shown after Workpad state changes. Mitigation: strict lineage, packet freshness, and Workpad projection parity filtering.
- Prompt context could become a hidden execution channel. Mitigation: no action dispatch, no new surface, tests for non-executing behavior.
