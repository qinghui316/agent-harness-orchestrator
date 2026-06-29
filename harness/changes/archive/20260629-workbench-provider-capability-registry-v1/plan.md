# Plan: workbench-provider-capability-registry-v1

## Approach

Create a focused provider capability owner that composes current Codex runtime
signals into a stable snapshot. Add a project-scoped API and a Settings panel
view. Thread the snapshot identity into existing Codex run metadata with minimal
touches to run owners.

## Steps

1. Add provider capability types and Codex snapshot builder.
2. Add Workbench API route for project/global provider capabilities.
3. Add Settings UI section for Codex capability matrix.
4. Add run metadata enrichment where existing Codex run events are emitted.
5. Add targeted tests and update review evidence.

## Decisions

- V1 provider set is exactly `codex`.
- V1 product mode is exactly `harness`; `agent` is a future reserved concept,
  not visible behavior.
- Runtime readiness is separate from spec capability so "the runtime should
  support this" and "this project/session can use it now" do not collapse.
- Future providers are not shown as selectable until they have real adapters.

## Minimality Gate Plan

- Can this be a no-op: no; provider readiness is currently scattered and future
  provider work would otherwise add local checks to each feature.
- Reuse: existing Codex diagnostics, model settings, app-server model list,
  Skill runtime targets, and attachment image support.
- Shared root fix: centralize readiness aggregation instead of adding more
  feature-local provider checks.
- Avoided: no provider switching, no normal Agent mode, no fake provider rows in
  ordinary UI, no new permission system.
- Smallest coherent change: registry + API + settings display + run metadata.

## Module Boundary Plan

- Owner module: new provider capability owner under `src/provider-runtime/` or
  equivalent focused runtime module.
- New / moved responsibilities: aggregate provider capability snapshots only;
  existing feature owners keep their detection and runtime logic.
- Facade touch points: Workbench API router delegates to the provider owner.
- Forbidden write-back locations: do not add provider branching into broad UI
  shell, Codex run owners beyond metadata, or Harness gate/action modules.
- Compatibility surface: existing Codex diagnostics/model APIs remain
  compatible.
- Boundary tests: server route, Codex snapshot, Settings DOM, and no fake
  provider selector assertions.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Codex diagnostics/model settings,
  runtime diagnostics, Skill runtime targets, attachment runtime modes, run
  events.
- Why existing mechanisms are insufficient: they report individual feature
  state but do not provide a provider-level capability contract for future
  adapters.
- Domain-specific logic location: Codex-specific mapping stays in the Codex
  provider adapter.
- Shared cross-cutting logic location: capability key/state types and snapshot
  hashing live in provider-runtime.
- Local framework avoided: no feature-local provider state machines or
  provider-specific UI branches.
- Future-cost reduction: future provider adapters can implement the same
  snapshot contract before becoming selectable.

## Planning-Discovered Gaps

None.
