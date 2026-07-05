# Plan: provider-native-a2a-runtime-alignment-v1

## Approach

Use the smallest root-cause fix:

1. remove ordinary-chat auto-delegation and prompt text that encourages it;
2. preserve Codex native plan/request-input events as owned runtime events;
3. split ordinary runtime scope from Harness change scope in Codex app-server
   bookkeeping;
4. leave explicit Harness planning actions and execution gates intact.

## Steps

1. Update active change docs and tests to lock the new boundaries.
2. Remove `runProjectScopedPlanningAgentDelegationIfNeeded` from ordinary
   conversation creation/post paths and delete or demote its text heuristic.
3. Clean the main-agent project chat prompt so it speaks naturally and does not
   instruct visible planning-agent handoff language.
4. Add Codex app-server runtime-scope fields while keeping `changeId` available
   for true Harness-scoped callers.
5. Update Codex chat bridge so native plan events are not emitted through
   `assistant.delta`; preserve them as structured agent/plan events.
6. Keep requestUserInput routing agent-scoped and verify it does not enter
   confirmationQueue.
7. Update Agent workspace/read-model tests so planning-agent appears from
   explicit planning action evidence, not from ordinary chat.
8. Run targeted tests, typecheck/lint/build, and record real UI acceptance or
   a clear runtime blocked reason.

## Decisions

- V1 does not add `delegate_planning` as an AHO dynamic tool. That is a later
  fallback only if provider-native child/plan events are insufficient.
- V1 keeps existing `planning.generate/revise/confirm-execution` as explicit
  Harness planning actions. They are not triggered by ordinary composer text.
- V1 introduces provider-neutral event shape only where needed for Codex plan
  and question ownership; it does not build a full provider SDK.

## Minimality Gate Plan

- Can this be a no-op: no; current ordinary-chat path still auto-delegates and
  native plan events are flattened into assistant text.
- Reuse: existing Codex app-server bridge, Workbench live events,
  parent-agent transcript scoping, and planning action handlers.
- Shared root fix: chat route owners, Codex bridge, app-server active turn
  bookkeeping, and Agent workspace projection are checked.
- Avoided: no custom delegate tool, no new controller, no provider runtime
  implementation, no new workflow truth.
- Smallest coherent change: remove heuristics, keep native events structured,
  and keep explicit Harness action boundaries.

## Module Boundary Plan

- Owner module: `src/workbench/chat.ts` for ordinary conversation behavior;
  `src/codex/app-server.ts` and `src/workbench/codex-chat/bridge.ts` for
  provider runtime event ownership.
- New / moved responsibilities: native plan event projection remains runtime
  interaction state, not Harness truth.
- Facade touch points: Workbench server chat routes and live transcript events.
- Forbidden write-back locations: confirmationQueue, automation allowlists,
  ToolPolicyGate, Scheduler, IntegrationCheck, apply/close owners.
- Compatibility surface: old snapshot compatibility is not required; explicit
  Harness action payloads remain compatible.
- Boundary tests: ordinary chat no auto-delegation; plan events not main prose;
  requestUserInput not confirmation gate; app-server scope not fake change.
- Follow-up split candidates: dynamic tool fallback and Claude Code runtime.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Codex Plan Mode, Workbench live
  transcript, agentRoleId scoping, planning.confirm-execution revalidation.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  no broad new mechanism planned; only narrow event ownership fields are added.
- Domain-specific logic location: Codex event parsing stays in app-server /
  codex-chat bridge; UI projection stays in Workbench read-model/web panels.
- Shared cross-cutting logic location: provider-neutral event naming is limited
  to Workbench live event types for this V1.
- Local framework / state machine / projection / validation / gate avoided:
  no second controller or second planning gate.
- Future-cost reduction for similar features: Claude/OpenCode can map their
  native events into the same projection without copying Codex heuristics.

## Planning-Discovered Gaps

- Existing ordinary chat still contains text-based auto-delegation and must be
  removed before real UI acceptance.
- Native plan events currently have callback hooks but are flattened through
  text delta in the bridge.

