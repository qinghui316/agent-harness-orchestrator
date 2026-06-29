# Spec: workbench-provider-capability-registry-v1

## Goal

Implement a small Provider Capability Registry that exposes AHO's current Codex
runtime capabilities as a stable, reference-style matrix. The registry must
separate provider identity, product mode, and Harness execution mode so future
normal Agent mode and future providers can be added without polluting Harness
authority or scattering provider checks.

## Users

- AHO users configuring or diagnosing Codex in Workbench.
- Future implementers adding Claude Code / OpenCode / Gemini adapters.
- Harness-mode runtime code that needs a compact provider/model/capability
  identity in run evidence.

## Acceptance Criteria

- AC-001: A project-scoped provider capability API returns a Codex-only
  snapshot with stable capability keys and separate spec capability vs runtime
  readiness.
- AC-002: The Codex snapshot reuses existing diagnostics/model/app-server/skill
  and attachment readiness rather than duplicating owner logic.
- AC-003: Workbench Settings displays a Codex capability matrix with readable
  supported/degraded/unavailable states.
- AC-004: The composer remains Codex-only and does not show fake provider
  selectors or unsupported Claude/OpenCode/Gemini controls.
- AC-005: Codex run events/artifacts record `providerId: codex`,
  `productMode: harness`, effective model, and capability snapshot identity.
- AC-006: Capability registry output is diagnostics/readiness only and does not
  authorize workflow actions, apply/close, scheduler, remote, merge, PR, or
  Harness evolution.

## Non-Goals

- Implementing ordinary Agent mode.
- Implementing non-Codex providers or provider switching.
- Adding arbitrary custom model ids or API provider model mapping.
- Moving existing Codex model, diagnostics, Skill, attachment, or session
  continuation owners into a new framework.
- Changing `confirmationQueue.primary`, ToolPolicy, Goal Loop, Scheduler,
  validation/audit, apply/close, or Harness evolution authority.

## Constraints

- Reference alignment must use `desktop-cc-gui` as architecture evidence, not
  source to vendor-copy.
- Provider registry is a runtime readiness layer, not workflow truth.
- UI must remain honest: only real Codex behavior may be clickable in ordinary
  UI.
- Capability keys should be stable enough to support future provider adapters.

## Risks

- Over-abstracting V1 into a fake multi-provider framework. Mitigation: V1 only
  registers Codex and leaves future providers non-runnable.
- Duplicating existing Codex detection logic. Mitigation: adapter composes
  existing diagnostics/model/settings/skill/attachment owners.
- Confusing provider mode with Harness execution mode. Mitigation: keep
  `Provider`, `ProductMode`, and `HarnessExecutionMode` as distinct concepts in
  types and UI.
