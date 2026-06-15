# Spec: Phase 10U Goal Loop Guided Gate Handoff Acceptance

## Goal

Ensure the main Agent can use fresh Goal Loop controller policy to explain the selected demand's current concrete Harness gate without turning that explanation into execution authority.

When the Workpad-visible `GoalLoopNextStepPacket` and `GoalLoopControllerPolicy` match the current confirmation gate, `chat.ask` and `orchestrator.plan` prompt artifacts should include a guided gate handoff section that names the action type, target ids, and required revalidation/human gate. If the policy is stale, mismatched, or no longer Workpad-visible, the guided handoff must be absent.

## Users

- AHO users reading the main demand conversation.
- The main Agent / orchestrator prompt context that explains the next safe step.
- Future agents auditing why the main Agent recommended a specific Harness gate.

## Acceptance Criteria

- AC-001: Docs record Phase 10T archived and Phase 10U active, with no stale Phase 10T active/current claim.
- AC-002: Fresh Workpad-visible packet + controller policy + current gate causes `chat.ask` and `orchestrator.plan` contexts/prompts to include a guided concrete Harness gate handoff.
- AC-003: Guided handoff includes action type and explicit target ids from `GoalLoopControllerPolicy.currentGate`, plus statements that the gate still requires stale revalidation, ToolPolicyGate, and human confirmation.
- AC-004: `context.prepared` run events preserve the guided gate action type and scope when the handoff is included.
- AC-005: Stale or Workpad-mismatched controller policy suppresses the guided handoff and controller policy context.
- AC-006: The guided handoff does not create actions, mutate the confirmation queue, execute recommendations, start scheduler/runtime work, run validation/audit/IntegrationCheck, mutate source, or alter workflow truth.
- AC-007: Main implementation remains in `src/goal-loop/*`; Workbench chat/orchestrator code remains a thin consumer.
- AC-008: Full verification passes, or any pre-existing failure is recorded.

## Non-Goals

- No new Workbench action, HTTP route, CLI command, UI/lazy projection, scheduler loop, worker start, validation/audit/IntegrationCheck execution, apply/close, child Change, source mutation, or worker prompt injection.
- No changes to Goal Loop evaluation, feedback, controller-policy compilation, or confirmation queue generation semantics.
- No changes to public artifact JSON shapes beyond additive `context.prepared` event data.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution records.
- Goal Loop packet/controller-policy evidence remains non-executing prompt context.
- Recommended action execution must remain a separate scoped Harness action with required target ids, stale revalidation, ToolPolicyGate, and human confirmation.
- New logic must live in owned `src/goal-loop/*` modules; broad facades may only consume the rendered section.

## Risks

- The main Agent could over-read the prompt section as approval to execute the recommendation. Mitigation: add explicit handoff wording and tests proving no action surface changes.
- The prompt could include stale target ids. Mitigation: continue using Workpad-visible packet/policy parity and add run-artifact assertions.
- Boundary logic could drift into Workbench facades. Mitigation: keep rendering in `src/goal-loop/main-agent-context.ts` and only pass additive metadata through the chat bridge.

