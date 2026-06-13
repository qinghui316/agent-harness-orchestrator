# Spec: Phase 10L Goal Loop Packet Freshness Confirmation Alignment

## Goal

Prevent stale Goal Loop next-step packet recommendations from shaping the main-Agent prompt context or Workpad resume summary after newer scheduler/runtime evidence supersedes the packet.

## Users

- Main Agent users who rely on the topic chat / orchestrator plan context to continue a long-running Goal/Change.
- Developers inspecting Workpad Goal Loop summaries after scheduler worker evidence advances.
- Future agents that must not treat old Goal Loop packet recommendations as current execution guidance.

## Acceptance Criteria

- AC-001: Docs and STATUS record Phase 10K closed and Phase 10L active with no stale Phase 10K active claim.
- AC-002: `src/goal-loop/` owns packet freshness / recommendation alignment logic.
- AC-003: Fresh packets still appear in main-Agent chat/orchestrator context and Workpad Goal Loop summary.
- AC-004: Packets whose recommendation or source evidence no longer matches current non-writing Goal Loop evaluation are treated as stale and skipped from main-Agent context.
- AC-005: Stale packets are also skipped from the Workpad Goal Loop summary so stale `recommendedActionType` is not shown as current guidance.
- AC-006: Freshness checks remain read-only and do not write new Goal Loop artifacts.
- AC-007: Goal Loop recommendations remain non-executing; no action handler, scheduler/runtime worker, IntegrationCheck, apply, close, source mutation, or child Change is invoked.
- AC-008: Existing concrete Workbench confirmations remain the execution surface and retain ToolPolicyGate, stale-target, decision/audit, and human-gate authority.
- AC-009: Focused tests cover fresh packet rendering and stale packet suppression after scheduler evidence changes.

## Non-Goals

- No Goal Loop controller, hidden continuation turn, Codex goal runtime copy, or automatic loop.
- No new Workbench action, route, CLI command, frontend control, lazy projection, public artifact shape, or scheduler action.
- No change to concrete scheduler, IntegrationCheck, apply, close, landing, PR, or merge execution behavior.

## Constraints

- Keep the owner module under `src/goal-loop/`; Workbench chat/projection modules may call the helper but must not own freshness policy.
- Freshness must be conservative: if current evidence cannot be checked, do not inject a packet as current guidance.
- `README.md` remains unrelated and untracked.

## Risks

- Overly strict freshness could hide useful packet context; tests should show fresh packets still render.
- Under-strict freshness could leave stale recommendations visible; tests must simulate evidence advancing after packet creation.

