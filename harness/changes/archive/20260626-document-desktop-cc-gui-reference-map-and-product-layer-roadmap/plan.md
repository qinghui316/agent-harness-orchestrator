# Plan: document-desktop-cc-gui-reference-map-and-product-layer-roadmap

## Approach

Treat `desktop-cc-gui` as a detailed product-layer reference, not an AHO architecture replacement. Add the repo as a reference submodule, then document exactly which source modules inform AHO's future app shell, workspace/project onboarding, engine/provider capability matrix, Codex bridge, composer, tools, Skills, memory/project map, diagnostics, settings, and packaging work.

## Steps

1. Add `desktop-cc-gui` under `reference-projects/` and register it in `.gitmodules`.
2. Update `docs/references/index.md` with the new reference and problem-routing rows.
3. Create `docs/design-docs/ref-desktop-cc-gui.md` with per-domain evidence, AHO adaptation, boundaries, phase, and acceptance signal.
4. Update `docs/CURRENT-DEVELOPMENT-PLAN.md` with a Desktop Product Layer Roadmap and staged backlog.
5. Update `docs/PRODUCT.md` to classify desktop-cc-gui as a product-layer and multi-engine desktop Agent reference.
6. Run docs/Harness checks and drift greps for provider/current-capability and workflow-truth mistakes.

## Decisions

- Harness mode remains first priority. Normal Agent mode is future work that can reuse the product shell with a different execution algorithm.
- Codex remains the only implemented execution provider. Claude Code / OpenCode / Gemini are future provider-matrix entries.
- Tauri packaging is a later productization route. This change records it as reference evidence only.
- The reference map is the detailed source of truth for this reference; current handoff docs should only point to it or summarize the next phase.

## Minimality Gate Plan

- Can this be a no-op: no; future product-layer work needs a durable reference map and source path.
- Reuse: reuse existing `reference-projects/`, `docs/references/index.md`, and `docs/design-docs/ref-*.md` pattern.
- Shared root fix: this is reference/documentation context, not a runtime bug.
- Avoided: no new product framework, provider registry, packaging setup, UI component, or runtime bridge.
- Smallest coherent change: add the reference submodule plus the minimum docs needed to make future staged work unambiguous.

## Module Boundary Plan

- Owner module: not applicable; docs/reference change only.
- New / moved responsibilities: none in product code.
- Facade touch points: none.
- Forbidden write-back locations: do not add implementation logic to Workbench facades or runtime bridges in this change.
- Compatibility surface: docs and reference index only.
- Boundary tests: docs/Harness lint plus drift greps.
- Follow-up split candidates: none.
- If not applicable, reason: no product modules change.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: reference-project index and design-doc map pattern.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism proposed.
- Domain-specific logic location: future work should use owned product modules; this change only documents candidate domains.
- Shared cross-cutting logic location: future provider/runtime/settings/shared shell work should use shared owners, not feature-local branches.
- Local framework / state machine / projection / validation / gate avoided: avoided all product-code mechanisms.
- Future-cost reduction for similar features: future agents can pick a documented phase and feature domain instead of re-reading the full reference repo or guessing boundaries.
- If not applicable, reason: product-code reuse coverage is documentation guidance only.

## Planning-Discovered Gaps

- `git submodule add -f` hit a Git for Windows submodule-helper segmentation fault. The equivalent manual path is to clone the repo under `reference-projects/desktop-cc-gui`, complete `.gitmodules`, and stage the gitlink.
