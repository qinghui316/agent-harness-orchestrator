# Spec: workbench-reference-style-codex-model-selection-v1

## Goal

Make AHO's Codex model display and selection real. The user should see the
effective Codex model in the composer, choose a model from real sources, and
have that model used by Codex runs without changing Harness workflow authority.

## Users

- Local Harness-mode users who want predictable Codex model selection.
- Future provider-work authors who need a clean Codex-first model boundary.

## Acceptance Criteria

- AC-001: Codex config model is read through a TOML parser with clear degraded
  diagnostics for missing, empty, or invalid config.
- AC-002: Workbench exposes Codex model candidates from runtime `model_list`,
  config model, and user custom models without fake provider entries.
- AC-003: User-selected model persists as AHO runtime preference and drives the
  composer model label.
- AC-004: Codex exec and app-server Workbench paths use the same effective
  model and record model/source evidence in run events or diagnostics.
- AC-005: Model selection does not trigger workflow actions and does not alter
  Harness gates, source safety, scheduler, apply/close, or Harness evolution.

## Non-Goals

- Do not add Claude Code / OpenCode / Gemini.
- Do not write the Codex config `model` field.
- Do not build a full provider capability matrix.
- Do not change `逐步确认` / `自动推进` semantics.

## Constraints

- Reference-driven behavior must follow `desktop-cc-gui`: read config model,
  attempt runtime model list, degrade honestly, and avoid fake controls.
- AHO model setting is runtime preference, not workflow truth.
- `README.md` and `reference-projects/` remain untracked.

## Risks

- Adding a parser dependency can touch `package.json` / lockfile; preserve
  pre-existing package metadata edits.
- Some Codex installations may not support model listing; UI must remain useful
  with config/custom/default sources only.

