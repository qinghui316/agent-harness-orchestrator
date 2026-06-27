# Plan: workbench-reference-style-skills-catalog-and-codex-bridge-v1

## Approach

Reuse the existing AHO skill catalog and Codex bridge rather than creating a new
skill framework. Extend the catalog from import-only managed skills to a
reference-style source index: managed skills, project Codex skills, and
user-registered custom roots. Global Codex skill directories are not scanned by
default; users may register them explicitly as custom roots when they want those
skills in a project. Keep enablement in the existing project/topic scope model
and materialize enabled packages through the existing AHO-managed Codex plugin
bridge.

## Steps

1. Update catalog storage for source kind and custom roots.
2. Replace the old narrow `SKILL.md`/`references`/`examples` copy rule with a
   safe package manifest walker that includes legal package content such as
   `scripts/` while skipping unsafe directories, symlinks, oversized files, and
   path escapes.
3. Extend `listSkills` / refresh behavior to scan managed, project Codex, and
   user-registered custom roots.
4. Keep project/topic enablement and enabled-skill prompt/run-context plumbing,
   adding runtime target and bridge sync details.
5. Add Workbench API endpoints for roots, skill listing, enablement, and Codex
   bridge sync.
6. Add a Settings `技能` panel and composer indicator backed by real API state.
7. Update tests, docs, and review evidence; run targeted and required checks.

## Decisions

- Skill packages are runtime capability packages. They are not Change artifacts
  and do not authorize workflow actions.
- V1 syncs the full legal package into Codex bridge, including `scripts/`, but
  AHO itself does not execute scripts.
- V1 keeps provider-neutral fields in API responses but only implements Codex as
  a runtime target.
- No fake marketplace, model dropdown, provider dropdown, or `$skill` completion
  is shown.

## Minimality Gate Plan

- Can this be a no-op: no; Workbench has no custom-root Skill catalog or UI for
  Skill enablement/sync.
- Reuse: existing `skill/catalog`, `codex/bridge`, `WorkbenchStore`,
  Workbench routes, Settings, and composer controls.
- Shared root fix: change the shared manifest/copy/hash helpers so CLI import,
  bridge sync, API, and UI all see the same legal package behavior.
- Avoided: no new Skill runtime, permission system, provider framework,
  marketplace, `$skill` completion, or workflow projection layer.
- Smallest coherent change: add catalog roots/source kinds and UI/API around the
  existing enablement + bridge mechanisms.

## Module Boundary Plan

- Owner module: `src/skill/catalog.ts` remains the catalog/manifest owner;
  `src/codex/bridge.ts` remains Codex materialization owner.
- New / moved responsibilities: custom roots and safe package manifest scanning
  are added to the skill owner; Workbench routes expose those operations.
- Facade touch points: Workbench API, Settings panel, composer indicator, CLI
  compatibility tests.
- Forbidden write-back locations: no writes to Harness Change artifacts,
  validation/audit/apply/close records, workflow projections, reference
  projects, or source roots except explicit bridge/materialization roots.
- Compatibility surface: existing CLI skill import/list/enable and Codex bridge
  commands continue working, with scripts now included as legal package content.
- Boundary tests: skill bridge, Workbench server, web DOM, Codex bridge tests.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: project/topic enablement,
  bridge_sync records, Codex plugin manifest materialization, run skill context,
  Workbench Settings shell.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new
  mechanism is proposed.
- Domain-specific logic location: Skill source scanning, metadata parsing, and
  package manifest safety live in `src/skill/catalog.ts`.
- Shared cross-cutting logic location: bridge status/materialization remains in
  `src/codex/bridge.ts`; Workbench API only forwards.
- Local framework / state machine / projection / validation / gate avoided: yes.
- Future-cost reduction for similar features: future provider targets can reuse
  the same catalog records and materialization status without redefining Skill
  package semantics.

## Planning-Discovered Gaps

- Reference project exposes Skills through Settings and runtime/session context,
  not as workflow truth. AHO should align the user-facing model while keeping
  Harness gates unchanged.
