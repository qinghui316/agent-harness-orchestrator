# Spec: workbench-harness-composer-execution-mode-controls-v1

## Goal

Make Harness-mode composer controls behave like a real session-level control
surface: the user can see `Codex / current model / 逐步确认|自动推进`, switch the
execution mode once, and have that choice persist for the current project/topic
or draft demand.

## Users

- Local AHO users who drive Harness mode from the desktop-style Workbench UI.
- Future agents that need clear separation between reference-inspired UI
  behavior and AHO Harness authority.

## Acceptance Criteria

- AC-001: The project-home composer and active-topic composer both show a
  reference-style control strip with provider, current model, and execution
  mode.
- AC-002: The execution mode is always switchable in the composer and persists
  per project/topic; draft mode migrates to the next created demand.
- AC-003: `planning.confirm-execution` uses the current composer execution mode:
  `逐步确认` does not start post-plan automation, while `自动推进` can start it
  only after human plan confirmation succeeds.
- AC-004: The right confirmation pane no longer presents an independent
  execution-mode selector; it remains a true current-gate confirmation and
  feedback surface.
- AC-005: Provider/model display is truthful: V1 only shows Codex and a real
  configured/default model label, without fake model dropdowns or unsupported
  providers.
- AC-006: Existing Harness boundaries remain intact: no automatic plan
  confirmation, raw scheduler, manual IntegrationCheck, integration
  apply/discard, PR, remote, merge, or Harness evolution.

## Non-Goals

- Normal Agent mode.
- Multi-provider capability matrix.
- Editable model catalog or persisted model switching.
- Changing Codex runtime sandbox/approval behavior.
- Adding file refs, slash commands, attachments, Skills, terminal, Git, or
  other composer toolbar features.

## Constraints

- `desktop-cc-gui` is interaction evidence only; its ordinary Agent permission
  model must not become AHO Harness authority.
- Composer session state is frontend-only V1 state and must not become workflow
  truth.
- Existing `request-approval` and `full-access` payload values stay compatible.
- Bottom-layer Codex runtime remains full-access capable in Harness mode; the UI
  mode controls AHO's upper-layer act strategy.

## Risks

- Duplicating mode state between composer and confirmation pane can create
  mismatched behavior; the confirmation pane must read from the same state but
  not own it.
- Showing a clickable model control before model switching exists would repeat
  the fake-control problem.
- Persisting mode globally instead of per project/topic could surprise users
  when switching conversations.
