# Desktop CC GUI Reference Map And Product Layer Roadmap

## Purpose

Add `zhukunpenglinyutong/desktop-cc-gui` as an official AHO reference project and write a detailed product-layer reference map. The map is meant to let future agents implement AHO's missing desktop/user-facing capabilities in stages without guessing which desktop-cc-gui modules to study or which AHO Harness boundaries must remain intact.

This is a docs/reference change only. It does not change Workbench runtime, UI behavior, provider support, Codex bridge behavior, packaging, source apply, scheduler, automation, or Harness evolution.

## Scope

In scope:

- Add the `desktop-cc-gui` reference source under `reference-projects/`.
- Update `docs/references/index.md`.
- Add `docs/design-docs/ref-desktop-cc-gui.md`.
- Update `docs/CURRENT-DEVELOPMENT-PLAN.md` with the Desktop Product Layer Roadmap.
- Update `docs/PRODUCT.md` to classify desktop-cc-gui as a product-layer reference.

Out of scope:

- Product runtime/UI implementation.
- Tauri packaging.
- Claude Code, OpenCode, Gemini, or other provider implementation.
- Normal Agent mode implementation.
- Any change to AHO workflow truth, local Goal Loop, scoped automation, scheduler, apply/close, remote, PR, or Harness evolution behavior.

## Current Status

Completed. Ready to close after final reindex/status checks.

## Verification

- `scripts/lint-ecl.ps1`: pass after active handoff pointer alignment.
- `scripts/lint-encoding.ps1`: pass.
- `scripts/harness-evolve.ps1 check`: pass; no pending evolution, one archive since last completion.
- Drift checks: no current Claude Code / OpenCode / Gemini / Tauri implementation claim added; desktop-cc-gui memory/session/UI state remains non-truth reference evidence.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: `git submodule add -f` hit a Git for Windows submodule-helper segmentation fault; the reference was cloned manually and `.gitmodules` was completed through `git config -f .gitmodules`.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable; only reference source was cloned under `reference-projects/desktop-cc-gui`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: recorded in `reviews/review.md`.
- Experience lifecycle result: not an auto-evolve change; no Harness rule/template mutation.
- Roadmap/current-direction stale language check: `docs/CURRENT-DEVELOPMENT-PLAN.md` now points next broad product work to Phase 1 desktop product-layer slices.
- Old experience retained / merged / retired / archive-only: no archive detail promoted; existing Harness truth boundaries retained.
