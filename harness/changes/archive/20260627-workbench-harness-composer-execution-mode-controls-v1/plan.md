# Plan: workbench-harness-composer-execution-mode-controls-v1

## Approach

Reuse the existing Workbench frontend state and action payload contracts, but
move mode ownership to a small composer-session helper. Keep the UI shaped like
`desktop-cc-gui` while mapping the semantics to AHO Harness: `逐步确认` means
wait on real gates; `自动推进` means start existing post-plan local automation
after human plan confirmation.

## Steps

1. Add a frontend-only composer session helper for per project/topic execution
   mode and draft-to-new-demand migration.
2. Extend Codex diagnostics with a read-only configured/default model label.
3. Add a shared composer control strip and use it in the project home and topic
   composer.
4. Wire topic creation and planning confirmation so the current composer mode is
   the single source for `postPlanAutomationMode`.
5. Remove the independent execution-mode selector from the right confirmation
   card while preserving confirmation/feedback actions.
6. Add targeted tests and update the active review with reference evidence,
   verification, fake-control checks, and boundary coverage.

## Decisions

- UI labels: `逐步确认` and `自动推进`.
- Internal payloads: existing `request-approval` and `full-access`.
- Provider: Codex only.
- Model selector: read-only V1 label unless a real model catalog and run
  propagation path is implemented in a later change.
- Persistence: frontend localStorage scoped by project/topic; no durable Harness
  memory write.

## Minimality Gate Plan

- Can this be a no-op: no; current UI state is not session-scoped and model
  display is static.
- Reuse: existing App state, ProjectHome, TopicComposer, DecisionPanels, Codex
  diagnostics, and `postPlanAutomationMode` contracts.
- Shared root fix: centralize mode in composer-session state instead of local
  selectors in each surface.
- Avoided: provider matrix, model catalog, normal Agent mode, new workflow
  runtime, new permission system, and fake toolbar controls.
- Smallest coherent change: one frontend helper, one shared control component,
  one read-only diagnostics field, and targeted UI/action tests.

## Module Boundary Plan

- Owner module: Workbench web shell/composer for UI state; Codex diagnostics for
  read-only model label.
- New / moved responsibilities: composer mode persistence and display move out
  of the confirmation card.
- Facade touch points: App wires helper state to existing actions.
- Forbidden write-back locations: Harness memory, ECL workflow truth, source
  apply/close records, provider settings.
- Compatibility surface: existing action payload values remain unchanged.
- Boundary tests: DOM tests for persistence, payload, and right-pane selector
  removal.
- Follow-up split candidates: real model selection/provider settings.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `planning.confirm-execution`
  `postPlanAutomationMode`, scoped automation, DecisionPanels confirmation
  actions, Codex diagnostics.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  helper is needed because existing React state is global and ephemeral.
- Domain-specific logic location: web composer/session helper and components.
- Shared cross-cutting logic location: none; this is UI session preference only.
- Local framework / state machine / projection / validation / gate avoided:
  yes.
- Future-cost reduction for similar features: creates a single place to attach
  later file refs/model selector without adding fake controls.

## Planning-Discovered Gaps

- Current diagnostics do not expose a model label to the web UI even though the
  app-server path can read the Codex default model. Add read-only diagnostics
  support only.
