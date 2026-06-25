# Spec

## Acceptance Criteria

- AC-001: A passed IntegrationCheck exposes existing `apply-check.apply` and `apply-check.discard` as human-confirmed Workbench gates, not scoped automation actions.
- AC-002: `applyIntegrationCheck` only applies when the check is passed, the source root is clean, source HEAD and selected artifact hash are fresh, and aggregate validation/audit passed.
- AC-003: `discardIntegrationCheck` rejects missing, stale, already applied, already discarded, or otherwise non-discardable checks at the handler layer.
- AC-004: Human-confirmed discard records a discarded IntegrationCheck and does not mutate source root.
- AC-005: E-drive real UI acceptance records apply and discard branch evidence, including Workbench URL, source/home paths, visible gate sequence, check id/status, and before/after `git status --short`.

## Non-Goals

- Do not implement a new workflow runtime or copy Open Dynamic Workflows into AHO.
- Do not expand `完全访问权限` to apply/discard, raw scheduler actions, close, merge, remote, or Harness evolution.
- Do not fix planning/decomposition honesty in this change.

## Constraints

- Reference projects are evidence only.
- Source root mutation must happen only after an explicit human apply confirmation.
- Discard must be source-safe and terminal.
