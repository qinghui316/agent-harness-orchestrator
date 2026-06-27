# Spec: workbench-reference-style-codex-runtime-model-picker-v1

## Goal

Make Workbench Codex model selection match the `desktop-cc-gui` runtime
semantics while preserving AHO Harness boundaries: the visible model comes from
real Codex runtime/config/default sources, not arbitrary AHO custom entries.

## Users

Local AHO users running Harness mode with Codex as the only active provider.

## Acceptance Criteria

- AC-001: The composer and model picker no longer expose add/remove custom
  model controls.
- AC-002: Effective model priority is user-selected real candidate, then Codex
  config model, then Codex default.
- AC-003: Stale legacy custom model settings are ignored or cleaned so they do
  not appear as valid candidates.
- AC-004: Runtime `model/list` uses the selected project's source/runtime
  context and is not blocked by AHO development-repo app-server diagnostics.
- AC-005: When runtime model listing is unavailable, ordinary UI shows a short
  degraded message and still falls back to config/default model.
- AC-006: Browser refresh restores the last valid selected project without
  making that UI preference workflow truth.
- AC-007: No fake provider controls, non-Codex providers, or workflow actions
  are introduced.

## Non-Goals

- Do not implement OpenAI API model mapping, Claude Code, OpenCode, Gemini, or
  a provider capability matrix.
- Do not automatically edit Codex `config.toml`.
- Do not alter `confirmationQueue.primary`, Goal Loop, Scheduler,
  validation/audit, apply/close, remote, PR, merge, or Harness evolution.

## Constraints

- `desktop-cc-gui` is a reference for the runtime model picker interaction, not
  an authority model for AHO Harness workflow.
- Model settings remain runtime preferences, not Change artifacts or Harness
  truth.
- Reference projects remain local-only and must not be tracked.

## Risks

- Codex runtime model listing may be unavailable until a trusted project/runtime
  context exists; UI must degrade honestly instead of pretending a complete list
  is available.
- Existing user settings may contain custom ids from the previous slice; those
  must not keep leaking into visible candidates.
