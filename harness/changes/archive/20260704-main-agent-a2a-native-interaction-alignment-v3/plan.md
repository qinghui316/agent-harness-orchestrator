# Plan: main-agent-a2a-native-interaction-alignment-v3

## Approach

Make a narrow alignment pass over the existing owners instead of adding another
interaction layer. Role delegation should treat conversation id as transcript
metadata. Planning should continue using the existing planning action handler,
but its prompt/profile should stop fighting native Codex Plan Mode. The
frontend should keep the child workspace transcript-first and route native
runtime questions through the same child transcript surface.

## Steps

1. Update role delegation policy so `changeId` scopes workflow evidence while
   `conversationId` scopes transcript/audit metadata.
2. Thin the planning-agent bundled profile and generated delegation prompt.
3. Keep native plan/question events scoped to planning-agent workspace and
   prevent planning drafts from becoming main transcript prose.
4. Remove lingering child workspace summary/action UI surfaces that make the
   panel look like a system form instead of a chat.
5. Add/update targeted tests for delegation identity, planning prompt shape,
   Agent workspace UI, and boundary preservation.

## Decisions

- Use existing `planning.confirm-execution` for implementation intent; do not
  introduce a new action.
- Treat Codex Plan Mode as the primary planning interaction; AHO bundle
  derivation remains a background Harness adapter.
- Do not add a "continue current task" homepage entry; the Agent should infer
  project progress from project files and Harness evidence.

## Minimality Gate Plan

- Can this be a no-op: no; current delegation policy still encodes old
  conversation/change coupling and planning prompts still force AHO templates.
- Reuse: existing Codex app-server, planning action, Agent workspace transcript,
  and confirmation revalidation are reused.
- Shared root fix: delegation policy, planning prompt builder, profile text, and
  workspace rendering are the shared roots inspected.
- Avoided: no new runtime controller, queue, permission system, or dedicated
  questionnaire engine.
- Smallest coherent change: update existing owners and tests only.

## Module Boundary Plan

- Owner module: existing delegate-task, planning action handler, Codex bridge,
  and Agent workspace projection/UI owners.
- New / moved responsibilities: none; this is alignment of current owners.
- Facade touch points: Workbench planning actions and Agent workspace read-model.
- Forbidden write-back locations: confirmationQueue, ToolPolicyGate,
  automation allowlist, Scheduler, IntegrationCheck, apply/close owners.
- Compatibility surface: old conversation snapshots are not preserved.
- Boundary tests: delegation identity, UI projection, and action boundary tests.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `runCodexChat` Plan Mode,
  `planning.confirm-execution`, Agent workspace transcript rendering, role
  delegation policy.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: planning handler/profile and Agent workspace.
- Shared cross-cutting logic location: delegate-task policy for identity
  separation.
- Local framework / state machine / projection / validation / gate avoided:
  avoided.
- Future-cost reduction for similar features: child-agent surfaces can continue
  to reuse transcript-style runtime items instead of bespoke cards.

## Planning-Discovered Gaps

None yet.
