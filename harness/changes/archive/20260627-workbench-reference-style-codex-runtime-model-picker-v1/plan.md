# Plan: workbench-reference-style-codex-runtime-model-picker-v1

## Approach

Reuse the existing Codex model settings owner and Workbench UI picker. Remove
the custom-model branch, tighten the candidate/effective-model resolver, make
the runtime model-list probe project-scoped, and store selected-project restore
as frontend-only UI state.

## Steps

1. Inspect current Codex model resolver, Workbench model routes, composer
   picker, and reference `desktop-cc-gui` model-list/session files.
2. Update the Codex model settings owner to ignore legacy custom models and
   only surface runtime/config/default candidates.
3. Change runtime `model/list` probing so selected-project source/runtime
   context is used and user-facing degraded reasons are sanitized.
4. Remove custom model controls from the picker and ensure stale custom entries
   are absent from UI.
5. Add frontend selected-project restore with validation against current
   project list.
6. Add/adjust targeted backend and DOM tests; run verification and record real
   UI acceptance if feasible.

## Decisions

- No custom model UI until provider/API model mapping exists.
- No fake non-Codex provider controls.
- Runtime listing can degrade to config/default; it must not block Workbench.

## Minimality Gate Plan

- Can this be a no-op: no; current UI exposes arbitrary custom model ids and
  raw model-list diagnostics.
- Reuse: existing Codex model settings owner, Workbench model routes,
  ProjectHome/CodexModelPicker, and frontend selected-project flow.
- Shared root fix: fix model candidate resolution and project-scoped model-list
  probing instead of adding picker-only guards.
- Avoided: provider matrix, API mapping, second settings store, fake provider
  dropdown, and workflow-action changes.
- Smallest coherent change: remove custom model branch, sanitize degraded UI,
  and add selected-project restore.

## Module Boundary Plan

- Owner module: `src/codex/model-settings.ts` for model candidates/effective
  model; Workbench React shell for UI picker/restore behavior.
- New / moved responsibilities: none; this tightens existing owners.
- Facade touch points: Workbench server model routes remain thin API wrappers.
- Forbidden write-back locations: Harness Change artifacts, Codex
  `config.toml`, provider-specific future settings, and workflow action code.
- Compatibility surface: API keeps returning effective model/candidates, with
  custom entries removed/ignored.
- Boundary tests: targeted Codex, Workbench server, and web DOM tests.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Codex model settings, diagnostics
  routes, composer model picker, and project list/open flow.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: Codex runtime/config candidate resolution in
  Codex owner; display logic in existing picker component.
- Shared cross-cutting logic location: not applicable beyond existing settings
  route helpers.
- Local framework / state machine / projection / validation / gate avoided:
  avoided a provider matrix and second model registry.
- Future-cost reduction for similar features: future provider work can add a
  real capability matrix without cleaning up fake custom-model semantics first.

## Planning-Discovered Gaps

- Prior real UI smoke showed raw app-server diagnostics in the picker and
  project selection lost after refresh.
