# Plan: workbench-orchestration-map-real-ui-and-collapsible-confirmation-rail-v1

## Approach

Add one small frontend shell owner around the existing decision inspector. The
shell owns only collapsed/expanded layout, badge display, and toggle buttons.
It receives the current confirmation counts from `App.tsx` and renders the
existing `DecisionInspectorPane` only when expanded. The graph remains the
existing read-only projection and canvas.

## Steps

1. Add `DecisionPaneShell` under `src/web/src/panels/workbench/` and export it
   through the existing Workbench panel barrel.
2. Wire `App.tsx` with frontend-only collapsed state, pending-count derivation,
   expanded/collapsed app-shell classes, and the new shell wrapper.
3. Add CSS for the 48px collapsed rail, 320px expanded pane, badge, primary-gate
   emphasis, toolbar collapse button, and responsive grid columns.
4. Update Workbench DOM tests so App-level confirmation tests explicitly expand
   the rail before asserting primary cards, and add focused tests for the
   collapsed rail and graph behavior.
5. Run targeted and required verification, then perform real in-app browser
   screenshot acceptance from a fresh built Workbench process.
6. Close the change, update handoff docs if the product baseline changes, and
   git settle while excluding unrelated `README.md`.

## Decisions

- The collapsed state is intentionally not persisted in V1. Default collapsed
  keeps the current screen simple; a later preference can use localStorage in a
  separate UI polish change.
- The shell may unmount the inspector while collapsed so confirmation buttons
  are not hidden but focusable. App snapshot and selected decision state remain
  in the parent.
- The center workspace grows through CSS grid column changes, not through
  separate routing or projection behavior.

## Minimality Gate Plan

- Can this be a no-op: no; screenshots and user feedback show the current shell
  keeps the confirmation pane fully open and visually crowded.
- Reuse: reuse `DecisionInspectorPane`, `confirmationQueue`, existing run graph
  projection, existing canvas, and existing App snapshot state.
- Shared root fix: this is a shell/layout concern, not a server or action
  contract issue; the only shared caller is the App-level Workbench shell.
- Avoided: no new projection, no action path, no persisted preference system, no
  workflow runtime, no graph engine.
- Smallest coherent change: one shell component, App wiring, CSS, DOM tests, and
  real browser screenshots.

## Module Boundary Plan

- Owner module: `src/web/src/panels/workbench/DecisionPaneShell.tsx` owns the
  collapsible rail layout. `DecisionInspectorPane` remains the confirmation
  card/action owner.
- New / moved responsibilities: only rail toggle, badge, and shell layout are
  new. No confirmation logic moves.
- Facade touch points: `App.tsx` composes the shell and passes existing
  inspector props; `WorkbenchPanels.tsx` re-exports the shell.
- Forbidden write-back locations: do not add confirmation behavior to the shell,
  backend routes, server revalidation, or graph projection.
- Compatibility surface: no API, DTO, action payload, or projection shape
  changes.
- Boundary tests: App DOM tests for collapsed/expanded shell and graph
  rendering; existing DecisionInspectorPane tests remain component-level
  coverage for action behavior.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: existing confirmation queue,
  `DecisionInspectorPane`, run graph projection/canvas, and App shell layout.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new cross-cutting mechanism is proposed; the shell is a UI composition owner.
- Domain-specific logic location: rail display/counting is frontend shell logic.
- Shared cross-cutting logic location: confirmation authority remains in current
  queue/read-model/action owners.
- Local framework / state machine / projection / validation / gate avoided:
  avoided persisted UI state, new projection framework, and action duplication.
- Future-cost reduction for similar features: keeps future inspector-shell
  polish isolated without touching decision/action code.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

