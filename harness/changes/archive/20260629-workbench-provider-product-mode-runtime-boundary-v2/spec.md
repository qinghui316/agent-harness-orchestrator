# Spec: workbench-provider-product-mode-runtime-boundary-v2

## Goal

Codify AHO's provider/runtime boundary so later product features do not scatter
Codex/Harness/mode checks across the codebase. V2 should make the current
Codex/Harness runtime shape explicit, stable, and diagnosable without adding
future providers or changing Harness workflow authority.

## Users

- AHO users who need accurate Codex capability and degraded-state explanations.
- Future AHO implementers adding onboarding Skill runtime, runtime log, browser,
  Git write/history, file editing, normal Agent mode, or additional providers.

## Acceptance Criteria

- AC-001: Provider, Product Mode, and Harness Execution Mode are distinct in
  runtime types/API/UI wording. V2 exposes Codex/Harness only; future Agent mode
  may be typed but is not returned as runnable.
- AC-002: Codex provider runtime readiness aggregates existing diagnostics,
  model, Skill, image-input, and app-server/exec fallback summaries without
  migrating those owners or rewriting Codex runners.
- AC-003: Codex run artifacts/events that already pass through the supported
  runner paths record provider metadata: provider id, product mode, adapter,
  effective model/source, and a stable capability snapshot hash/version.
- AC-004: Capability snapshot identity is stable across `checkedAt` refreshes
  and is not treated as workflow truth or authorization.
- AC-005: Workbench UI shows only real Codex/Harness capability and does not
  expose fake provider selectors, normal Agent mode, or unavailable providers.
- AC-006: Scheduler, Goal Loop, validation/audit, apply/close, ToolPolicyGate,
  and confirmation actions do not depend on Provider Registry for authorization.

## Non-Goals

- Do not add non-Codex providers.
- Do not implement normal Agent mode.
- Do not expand Harness `自动推进` authority.
- Do not replace Change/ECL, run artifacts, validation, audit, apply/close, or
  Harness evolution truth.
- Do not vendor-copy `desktop-cc-gui`.

## Constraints

- Reuse existing Codex diagnostics, model settings, Skills, attachments,
  app-server, and exec fallback owners.
- Provider runtime may aggregate readiness summaries, but it must not own those
  domains' storage or policy.
- Raw stderr, stack traces, config paths, and memory paths remain advanced
  diagnostics only.
- UI copy must keep `逐步确认 / 自动推进` clearly scoped to Harness execution
  strategy, not Codex/provider permission.

## Risks

- The work could grow into a Codex runner rewrite. Mitigation: only add thin
  adapter/metadata wiring and keep existing owners.
- Future provider placeholders could look runnable. Mitigation: tests assert
  unavailable providers/product modes are not exposed as runnable.
- Capability hash could include time-varying fields. Mitigation: unit test hash
  stability across refresh timestamps.
