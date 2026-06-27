# Plan: workbench-reference-style-codex-model-selection-v1

## Approach

Add a small Codex model owner that reuses existing Codex trust/config paths,
Workbench API routing, composer controls, and Codex run bridges. Use a TOML
parser for config model parity with the reference project, keep model list
best-effort/degraded, and route every Workbench Codex invocation through a
single effective-model resolver.

## Steps

1. Add Codex model parsing/settings/resolution helpers and tests.
2. Extend Workbench Codex diagnostics/API with model candidates and update
   endpoints for selected/custom models.
3. Wire effective model into Codex exec/app-server chat, planning, and code
   paths.
4. Update composer/settings UI to expose a real model picker without provider
   placeholders.
5. Run targeted and aggregate verification, then close and git-settle.

## Decisions

- Store the selected model in AHO runtime settings, not Codex config.
- Keep custom model entries explicit; do not invent a built-in catalog.
- Treat runtime model list failure as degraded diagnostics, not product failure.

## Minimality Gate Plan

- Can this be a no-op: no; current UI shows a model label but lacks a real
  persisted selection and unified runtime propagation.
- Reuse: existing Codex trust/config path, Workbench API router, composer
  controls, Codex argv builders, and app-server turn wrapper.
- Shared root fix: centralize model resolution instead of passing ad hoc model
  strings at each run site.
- Avoided: provider matrix, model marketplace, fake dropdowns, and workflow
  authority changes.
- Smallest coherent change: Codex-only model settings and resolver.

## Module Boundary Plan

- Owner module: `src/codex/*` for config/model resolution; Workbench route/UI
  only call the owner.
- New / moved responsibilities: model settings and candidate resolution become
  Codex runtime responsibilities.
- Facade touch points: Workbench API and composer/settings props only.
- Forbidden write-back locations: Codex `config.toml` model, Harness artifacts,
  Change/ECL truth, source root.
- Compatibility surface: existing diagnostics and run paths remain valid.
- Boundary tests: model resolution, routes, UI picker, run argv/request model.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Codex config path/trust,
  diagnostics route, composer controls, Codex capability/argv builders,
  app-server turn wrapper.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  current config reader is regex-only and no owner stores selected/custom
  models or resolves an effective model.
- Domain-specific logic location: Codex model owner.
- Shared cross-cutting logic location: same resolver used by chat/planning/code.
- Local framework / state machine / projection / validation / gate avoided:
  no provider runtime framework or new workflow state.
- Future-cost reduction for similar features: gives provider-matrix work a
  clean Codex-first boundary later.
- If not applicable, reason: TBD.

## Planning-Discovered Gaps

None yet.

