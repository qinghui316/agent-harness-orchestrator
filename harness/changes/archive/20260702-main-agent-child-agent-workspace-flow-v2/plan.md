# Plan: main-agent-child-agent-workspace-flow-v2

## Approach

Use the existing transcript and read-model mechanisms instead of adding a second chat framework. Extract the transcript cell renderer into a reusable Agent transcript surface, add a right-rail `Agent` panel backed by a derived child-agent workspace projection, and move planning review/revise/accept affordances into that panel while keeping existing planning actions and stale revalidation.

## Steps

1. Extract reusable transcript UI from the current parent-agent conversation renderer.
2. Add a right-side `Agent` tool tab and panel that renders selected agent projection data.
3. Extend the Workbench read model with a bounded child-agent workspace projection for planning-agent and role-agent nodes.
4. Move planning draft display/revision/implementation controls into the planning-agent workspace while preserving backend `planning.generate`, `planning.revise`, and `planning.confirm-execution`.
5. Remove planning draft long-form prose from the main conversation/default transcript path.
6. Keep confirmationQueue focused on non-planning execution gates and update tests.
7. Update Workbench docs and active change closeout evidence.

## Decisions

- Reuse `ParentAgentTranscriptCell` wire shape with minimal optional agent metadata instead of creating a new transcript schema.
- Keep `planning.confirm-execution` as the canonical backend action; "实施此计划" is UI copy only.
- Treat the right Agent workspace as a projection and scoped interaction surface, not workflow truth.
- Keep planning-agent interactivity limited to planning draft revise/accept.
- Preserve confirmationQueue for apply/close/Scheduler/IntegrationCheck/remote/PR/merge/Harness evolution gates.

## Minimality Gate Plan

- Can this be a no-op: no; the current UI has no right Agent workspace and planning appears in the wrong surface.
- Reuse: existing owner/helper/mechanism considered: parent-agent transcript cells, Workbench read-model projection, right-rail shell, planning action handlers, confirmation action revalidation, and Agent graph nodes.
- Shared root fix: fix the surface/projection boundary instead of adding more filters to hide planning text after it is already in the main conversation.
- Avoided: local framework / single-use abstraction / future-only branch avoided: no second transcript renderer, no new action family, no new workflow truth, no child-agent runtime.
- Smallest coherent change: add a bounded Agent workspace projection/panel and migrate planning affordances there while retaining existing backend actions.

## Module Boundary Plan

- Owner module: Workbench read-model projection for child-agent workspace data; frontend Workbench panels for right-rail rendering; existing planning action handler for planning draft/revise/confirm.
- New / moved responsibilities: right-rail `Agent` panel and reusable transcript component; planning draft visible review moves from main transcript/confirmation card to the Agent panel.
- Facade touch points: Workbench snapshot DTO, right-rail shell wiring, existing `planning.confirm-execution` handler.
- Forbidden write-back locations: do not add child-agent action logic to broad App shell beyond wiring; do not add planning execution branches to confirmationQueue builder except filtering planning cards; do not add fake transcript rows in thread-stream projection.
- Compatibility surface: existing planning backend actions and target ids remain stable.
- Boundary tests: web/render tests for Agent panel, confirmationQueue suppression for planning, and action payload/revalidation tests for "实施此计划".
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: ParentAgentTranscriptCell renderer, Workbench snapshot/read-model, Agent run graph, planning bundle projection, workflow action revalidation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the right rail lacks an Agent workspace projection; adding one is necessary, but it should consume existing evidence rather than create truth.
- Domain-specific logic location: planning-agent display and revise/implement controls belong in the Agent workspace panel.
- Shared cross-cutting logic location: transcript rendering remains shared in the transcript component.
- Local framework / state machine / projection / validation / gate avoided: no new child-agent state machine or permission system.
- Future-cost reduction for similar features: coder/validator/auditor/scheduler worker details can reuse the same Agent workspace projection and transcript renderer.

## Planning-Discovered Gaps

None.
