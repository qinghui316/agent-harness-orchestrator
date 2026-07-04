# Spec: main-agent-a2a-native-interaction-alignment-v3

## Goal

Make AHO's A2A planning interaction match the intended product model: the
center conversation is the main Agent conversation; planning-agent runs in the
right Agent workspace using native Codex Plan Mode; Harness progress remains
project evidence, not chat transcript identity.

## Users

- Users who create or refine a demand through the Workbench.
- Main Agent turns that delegate planning work to a bounded planning-agent.
- Developers maintaining Workbench transcript, Codex bridge, and Harness action
  boundaries.

## Acceptance Criteria

- AC-001: Role delegation no longer requires `conversationId === changeId`;
  conversation id is transcript metadata and Change id remains the workflow
  evidence scope.
- AC-002: planning-agent prompt/profile no longer forces an AHO AC/tasks
  template; it uses a thin delegation context plus Codex native Plan Mode.
- AC-003: Native plan stream and runtime user-input events are scoped to the
  selected child Agent workspace and do not appear as long main conversation
  prose.
- AC-004: The Agent workspace remains transcript-first: child agents only,
  messages above, composer fixed below, no summary cards, no standalone
  implementation button, no global execution mode control.
- AC-005: "Implement this plan" typed in the planning-agent composer still uses
  the existing `planning.confirm-execution` action and stale target checks.
- AC-006: Harness authority is unchanged: confirmation queue, ToolPolicy,
  action registry, automation allowlist, validation/audit, Scheduler,
  IntegrationCheck, apply, close, remote, PR, merge, and Harness evolution are
  not expanded.

## Non-Goals

- Do not build a second workflow runtime or controller.
- Do not put planning artifacts back into the main transcript.
- Do not make planning-agent a recursive orchestrator.
- Do not support old conversation snapshot compatibility.

## Constraints

- User-visible text should avoid internal terms such as Change id, TaskRun,
  WorkflowRun, canonical artifact, and gate unless the user explicitly asks for
  technical evidence.
- The implementation must reuse existing Codex app-server, planning action, and
  Agent workspace owners where possible.
- Real implementation may be followed by a separate real UI acceptance/fix pass
  if app-server runtime behavior requires live validation.

## Risks

- Over-filtering could hide useful child-agent evidence from the right
  workspace.
- Under-filtering could leak planning draft or internal terms into the main
  conversation.
- Removing the conversation/change equality check must not weaken same-Change
  artifact and target validation.
