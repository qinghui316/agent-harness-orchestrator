# Spec: provider-native-a2a-runtime-alignment-v1

## Goal

Make AHO's visible A2A behavior provider-native and honest:

- ordinary chat stays a main-agent conversation;
- child-agent work appears only from an owned runtime / Harness action path;
- Codex native Plan Mode events remain plan/question events, not assistant prose;
- future providers can map their own event streams without inheriting
  Codex-specific planning heuristics.

## Users

- Users who expect the middle conversation to behave like a normal Agent chat.
- Users who inspect planning-agent / coder / validator / auditor work in the
  right Agent workspace.
- Future runtime integrators for Claude Code / OpenCode.

## Acceptance Criteria

- AC-001: Ordinary project chat does not create a Harness Change and does not
  start planning-agent from message text, assistant text, or fixed phrases.
- AC-002: Main-agent prompts no longer instruct the model to say it will hand
  planning to planning-agent.
- AC-003: Codex native plan delta/update/completed events remain scoped to the
  planning-agent/plan surface and do not become main transcript assistant text.
- AC-004: Codex requestUserInput remains a runtime question card scoped to the
  owning agent/run and is not a Harness confirmation gate.
- AC-005: Ordinary app-server turn bookkeeping uses conversation/runtime scope
  instead of pretending the conversation id is a Harness change id.
- AC-006: Planning-agent still works through the explicit existing planning
  action path and Codex Plan Mode; "implement this plan" still uses existing
  planning.confirm-execution validation.
- AC-007: UI/read-model boundaries still keep full plans, internal ids, and
  child-agent content out of the main transcript.
- AC-008: Confirmation queue, automation allowlist, ToolPolicyGate, Scheduler,
  IntegrationCheck, apply, and close authority are unchanged.

## Non-Goals

- Do not implement Claude Code / OpenCode in this change.
- Do not add a custom delegate_planning dynamic tool in this change.
- Do not introduce a second workflow truth, second controller, or new action
  type.
- Do not auto-run code, apply, close, scheduler, IntegrationCheck, remote,
  merge, PR, or Harness evolution.

## Constraints

- Use existing Codex app-server Plan Mode and live event paths where possible.
- If native live events are unavailable, mark the path replay/fallback or
  blocked; do not fake child-agent output.
- Conversation transcript is interaction state; Harness Change artifacts remain
  workflow truth only after an explicit Harness workflow path exists.
- Do not include internal terms such as Change, bundle, AC, tasks, TaskRun, or
  WorkflowRun in main user-facing prose.

## Risks

- Removing heuristic delegation changes visible behavior: planning-agent may no
  longer appear unless the explicit planning action path or provider-native
  child/plan event path is used.
- Existing tests may assume planning-agent auto-starts after new chat and need
  to be updated to the new boundary.
- Codex app-server support may not expose every future A2A primitive; this
  change must avoid inventing a fake replacement.

