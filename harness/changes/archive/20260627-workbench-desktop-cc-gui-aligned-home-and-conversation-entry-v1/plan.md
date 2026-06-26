# Plan: workbench-desktop-cc-gui-aligned-home-and-conversation-entry-v1

## Approach

Create a small Workbench home-chat owner that follows the reference shape but
uses AHO concepts. The selected-project no-topic route renders this owner
instead of the current readiness dashboard. The owner submits through the
existing `createTopicFromComposer` path, then navigates to the normal
Workbench conversation.

## Steps

1. Add / refactor frontend owner components for:
   - selected-project HomeChat surface;
   - lightweight home demand composer;
   - settings advanced diagnostics placement.
2. Wire App state so `beginNewConversation` opens the HomeChat composer and
   composer submit creates and selects a demand topic.
3. Demote Codex diagnostics from the main home to settings / advanced detail.
4. Wire a real composer-level permission mode toggle. The toggle is session UI
   state like Codex permission mode; it is passed to later confirmation surfaces
   instead of being a fake display chip.
5. Remove reference-like controls that do not have implemented behavior yet,
   including fake refresh/project dropdown/recent-session affordances.
6. Update styles to match the reference: calm left sidebar, centered composer,
   sparse copy.
7. Update DOM tests and run real UI acceptance.

## Decisions

- The reference project is evidence for interaction and visual hierarchy, not
  source code to copy.
- V1 keeps only real AHO actions visible: send/create demand, sidebar project
  selection, settings, and a real permission mode toggle.
- Existing Workbench `/topics` remains the conversation creation API.
- Diagnostics stay read-only and move behind settings / advanced detail.
- Project switching remains in the sidebar for V1; the center project name is
  a read-only label until a real project picker exists.
- Recent-session chips stay out of V1 because the current implementation does
  not yet provide a reference-quality session resume flow.

## Minimality Gate Plan

- Can this be a no-op: no; the current visible product entry contradicts the
  selected reference and user expectation.
- Reuse: existing topic creation, project snapshots, sidebar conversation
  summaries, settings overlay, Codex diagnostics route, and existing
  request-approval/full-access automation mode semantics.
- Shared root fix: the root problem is selected-project no-topic rendering,
  so fix the home/shell owner instead of adding another diagnostic card.
- Avoided: no new database, provider registry, rich composer framework,
  permission system, workflow runtime, fake future toolbar actions, fake
  project picker, or fake recent-session shortcuts.
- Smallest coherent change: one corrected home-chat surface plus tests and
  settings placement.

## Module Boundary Plan

- Owner module: Workbench web UI home / shell components.
- New / moved responsibilities: selected-project no-topic home and home
  composer behavior.
- Facade touch points: `App.tsx` may only select the correct surface and pass
  handlers; main rendering logic belongs in focused components.
- Forbidden write-back locations: do not add new workflow branches to
  diagnostics, settings, or broad server route facades.
- Compatibility surface: existing project routes, topic creation route,
  snapshot shape, and Workbench conversation surface remain compatible.
- Boundary tests: DOM tests for no mutation on load, create topic on submit,
  settings diagnostics placement, and no unsupported visible actions.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: project registry/status,
  Workbench snapshots, workpad summaries, topic creation, settings overlay,
  Codex diagnostics.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  no new cross-cutting mechanism is proposed.
- Domain-specific logic location: home/composer frontend owner.
- Shared cross-cutting logic location: existing server routes and
  Workbench topic/chat owners.
- Local framework / state machine / projection / validation / gate avoided:
  no second session system, no alternate workflow truth, no fake provider
  capability layer.
- Future-cost reduction for similar features: future files/Git/terminal/Skills
  can attach to the home composer shell without changing topic creation or
  Harness authority.

## Planning-Discovered Gaps

- The current `ProjectReadinessHome` centralizes diagnostics and must be
  replaced as the selected-project no-topic default.
- Current tests assert the wrong diagnostics-dashboard behavior and need to be
  rewritten around conversation entry.
- Reference-like UI controls must either call a real implemented path or be
  omitted; the home page should not display non-clickable future features.

