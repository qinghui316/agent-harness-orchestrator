# Spec: provider-native-a2a-real-ui-acceptance-fix-pass-v1

## Goal

Verify and repair the real provider-native A2A user experience in AHO's
Workbench using the actual App, browser, and Codex app-server path. The flow
must look and behave like provider runtime interaction, not Workbench-generated
fake planning:

1. the main Agent responds naturally in the center transcript;
2. native planning events appear in the right `plan-session` / Plan Agent
   workspace, while child-agent events appear in the right planning-agent
   workspace only when the provider
   actually emits a child session;
3. native plan and user-question events are shown as interactive runtime
   content;
4. implementation continues through the provider runtime / main Agent path;
   the Agent reads project guidance and uses available tools to enter Harness
   only when the project rules require it.

## Users

- AHO users testing a project with the Workbench UI.
- Developers validating that Codex-native runtime events are projected without
  leaking internal Harness implementation details into the main transcript.

## Acceptance Criteria

- AC-001: A real browser run on the normal Workbench server records the event
  sequence and UI state for a new demand in `goal-loop-demo-real`.
- AC-002: The center transcript contains only user messages, natural main Agent
  replies, and short parent-level process rows; it does not contain full plans,
  task lists, internal object names, template plans, or persisted waiting text.
- AC-003: Codex app-server live events are classified from real runtime output:
  assistant deltas, native plan events, runtime user-input requests, and any
  provider-native child-agent events that this Codex version emits.
- AC-004: native plan output, question cards, feedback, and revision history
  appear only in the right `plan-session` / Plan Agent workspace or a real
  planning-agent workspace, based on provider ownership; they do not leak into
  the center transcript.
- AC-005: If native plan / question / child-agent capability is unavailable in
  the real runtime, the change records a blocked or fallback/replay result and
  does not claim live acceptance with fake output.
- AC-006: User feedback in the right-side plan surface revises or continues
  planning only. Implementation is available only through provider-native plan
  handoff / runtime continuation, not by parsing composer text and not by
  directly dispatching a Harness workflow action from ordinary chat.
- AC-007: Harness authority is unchanged: confirmationQueue, ToolPolicyGate,
  action registry, automation allowlist, Scheduler, IntegrationCheck, apply,
  close, remote, PR, merge, and Harness evolution are not expanded.
- AC-008: Main-Agent Plan Mode output is not mislabeled as `planning-agent`;
  the right workspace shows a plan session when only native Plan Mode evidence
  exists, and shows `planning-agent` only when a real provider child-agent /
  collab session is observed.
- AC-009: A reviewable Agent-authored plan in ordinary project chat can only
  hand back to the Agent/runtime for execution. The Agent, not Workbench,
  decides how to create/update Harness files after reading project guidance.
  Typing "实施此计划" in the composer must not trigger implementation.
  Ordinary project-scoped Plan Mode must not create, bind, or write a Harness
  Change/bundle and must not call `planning.confirm-execution`.
- AC-010: Agent-authored planning remains the only source for planning tasks.
  Decomposition must fail closed when accepted planning does not contain
  Agent-authored task evidence; it must not generate a fallback task from the
  demand text.
- AC-011: The old Workbench-engineered planning chain is removed from the
  normal product path. `planning.generate`, `planning.revise`,
  `planning.confirm-execution`, planning bundle projection, and `latest-bundle`
  UI surfaces must not appear in ordinary chat, Plan sessions, Agent workspace,
  confirmation queue, or next-action projections.

## Non-Goals

- Implementing Claude Code, OpenCode, Gemini, or a new provider.
- Adding a new controller, workflow runtime, action type, or automation
  permission.
- Reintroducing Workbench-created fake planning content or Workbench-created
  Harness state from ordinary project chat.
- Supporting old conversation snapshot compatibility.
- Keeping old planning action compatibility branches for testing-stage
  snapshots.

## Constraints

- Real UI acceptance is required. Unit tests can supplement but cannot replace
  browser verification.
- `codex exec` fallback may be observed and labeled as replay/fallback, but it
  cannot count as live app-server acceptance.
- A plan session / planning-agent cannot edit files, execute code,
  recursively delegate, apply results, or close changes. When the user chooses
  to execute a plan, control returns to the main Agent/runtime; Workbench still
  only exposes tools and boundaries.
- User-visible UI should use plain product language and avoid internal terms
  such as `Change`, `bundle`, `AC`, `tasks`, `TaskRun`, and `WorkflowRun`.

## Risks

- Codex app-server may not emit native child-agent events in the installed
  version; this must be recorded as blocked/fallback rather than hidden.
- Existing projections may still route planning content into the parent
  transcript.
- Browser/App server may run an old bundle if not rebuilt and restarted before
  acceptance.
- Old planning workspace affordances may still treat implementation as composer
  text intent instead of a plan handoff card.
