# Spec: document-desktop-cc-gui-reference-map-and-product-layer-roadmap

## Goal

Add `zhukunpenglinyutong/desktop-cc-gui` as an official AHO reference project and write a detailed reference map that future agents can use to implement the missing product layer in stages.

The reference should guide AHO toward a polished desktop Agent product while preserving AHO's Harness kernel: Change/ECL, accepted planning artifacts, validation/audit, worktree evidence, apply/landing/close, and human-gated Harness evolution remain the workflow truth.

## Users

- Future AHO implementation agents that need concrete reference evidence before changing UI, runtime bridge, project management, Skills, settings, or packaging.
- The product owner, who wants AHO to evolve from a working local Harness/Loop engine into a usable desktop Agent product.
- Reviewers who need to check that future Codex-first and later multi-provider work does not weaken Harness boundaries.

## Acceptance Criteria

- AC-001: `desktop-cc-gui` is added as a reference project under `reference-projects/` and listed in `docs/references/index.md`.
- AC-002: `docs/design-docs/ref-desktop-cc-gui.md` records inspected files, commit, feature-domain evidence, AHO adaptation, boundaries, suggested phase, and acceptance signal for each major product-layer domain.
- AC-003: `docs/CURRENT-DEVELOPMENT-PLAN.md` includes a staged Desktop Product Layer Roadmap that distinguishes Harness mode from future normal Agent mode.
- AC-004: `docs/PRODUCT.md` records desktop-cc-gui as a product-layer reference without claiming Tauri, Claude Code, OpenCode, or normal Agent mode are currently implemented.
- AC-005: Drift checks prove docs do not promote desktop-cc-gui memory/session/UI state into AHO workflow truth.

## Non-Goals

- No product runtime, Workbench UI, packaging, provider, or Codex bridge code changes.
- No Tauri adoption in this change.
- No Claude Code, OpenCode, Gemini, or provider abstraction implementation.
- No ordinary Agent mode implementation.
- No vendor-copying desktop-cc-gui source into AHO product code.
- No change to AHO's current workflow truth, local Goal Loop, scheduler, automation, apply/close, or Harness evolution behavior.

## Constraints

- Reference projects are submodules under `reference-projects/`; the map must be read before inspecting reference source for future work.
- Current actual provider remains Codex-only.
- Future provider expansion must go through a capability matrix and runtime bridge decision, not string branches scattered through product code.
- SQLite, project memory, context ledger, UI state, and session ids remain interaction/projection/memory layers unless a later accepted architecture decision promotes a specific object.
- The reference map must be detailed enough for staged implementation planning, but current handoff docs must not become an archive ledger.

## Risks

- Future agents may copy desktop-cc-gui's ordinary Agent mode into Harness mode and bypass Change/ECL gates.
- Future agents may overfit to Tauri packaging before the browser/local-server Workbench product shell is mature.
- Provider roadmap language may be mistaken for current Claude Code support.
- A broad reference map can create documentation bloat unless it stays in the design-doc reference map and the current plan keeps only phase-level guidance.
