# Plan: workbench-reference-style-slash-skill-composer-v1

## Approach

Follow the `desktop-cc-gui` composer pattern for Skill mentions while adapting
authority to AHO. The UI recognizes `/skill-name` and `$skill-name`, but AHO
records matched Skills as project/topic enablement and lets the existing Codex
bridge inject runtime context.

## Steps

1. Add a small frontend utility for Skill alias normalization, `/`/`$` inline
   extraction, unmatched-token preservation, and stable unique selection.
2. Load full project Skill items in Workbench web state, not only the enabled
   count.
3. Extend the composer with a bounded Skill picker and selected Skill chips.
4. On create-topic or send-message, resolve matched/selected Skills, enable
   them for the current/new topic through existing Skills API, and send the
   cleaned body.
5. Keep Codex runtime injection on the existing `getEnabledSkillContext` path
   and add tests for metadata / script non-execution boundaries.

## Decisions

- UI primary trigger is `/`; `$` is compatibility-only and Skill-only.
- Unmatched slash/dollar tokens remain user text.
- Draft selected Skills migrate to the newly created topic and do not become
  project-level enablement.
- Unsynced Skill bridge state is visible; selecting it may enable the topic but
  runtime warnings remain until the user syncs Codex bridge.

## Minimality Gate Plan

- Can this be a no-op: no; Settings-only Skill enablement leaves composer
  interaction incomplete.
- Reuse: existing Skills API, WorkbenchStore Skill enablement, Codex bridge, and
  composer shell.
- Shared root fix: bridge/runtime context already exists; missing root is the
  composer selection surface and send-time parsing.
- Avoided: marketplace, full slash command system, provider/model settings,
  file references, and a second Skill permission system.
- Smallest coherent change: slash/dollar Skill picker plus topic enablement
  migration.

## Module Boundary Plan

- Owner module: Workbench web composer + existing `src/skill/catalog.ts`.
- New / moved responsibilities: frontend-only selection parsing utility and
  composer picker state.
- Facade touch points: Workbench web API calls existing `/skills/*/enable`.
- Forbidden write-back locations: Harness workflow artifacts, Codex config,
  reference-projects, project source root.
- Compatibility surface: existing composer send/create behavior and Skills API.
- Boundary tests: unknown/stale Skill, topic enablement, run context, script
  non-execution, no fake controls.
- Follow-up split candidates: file references, full slash commands, model
  settings, provider matrix.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: topic Skill enablement,
  `getEnabledSkillContext`, Codex bridge sync status, composer execution-mode
  draft migration pattern.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new backend mechanism is proposed.
- Domain-specific logic location: Skill token parsing stays in a small frontend
  composer utility.
- Shared cross-cutting logic location: Skill source/enablement remains in
  `src/skill/catalog.ts` and WorkbenchStore.
- Local framework / state machine / projection / validation / gate avoided:
  yes; this is not a workflow gate.
- Future-cost reduction for similar features: establishes a bounded pattern for
  composer-scoped runtime capabilities before file refs and full slash commands.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

