# Plan: Phase 8W Runtime Permission External Execution Evidence Contract

## Approach

Use `src/runtime-continuity/` as the owner module. Add typed helper functions that append normalized evidence to the existing `agent-events.jsonl` stream through `appendAgentEventEnvelope()`. Then call those helpers from code, validation, audit, and mirrored ToolPolicyGate paths without changing existing behavior.

## Steps

1. Repair Phase 8V close handoff drift in `AGENTS.md` and docs.
2. Add Runtime Continuity event helper types/builders for permission profile, ToolPolicy decision, and external execution lifecycle.
3. Add tests that prove helper output scope is canonical and raw payload cannot forge scope.
4. Record permission profile and external execution events in code app-server / Codex exec paths.
5. Record permission profile and external execution events in validation command paths.
6. Record permission profile and external execution events in audit Codex readonly paths, including capability-failure behavior.
7. Add the `permission.decision.recorded` helper so existing ToolPolicy decisions can be mirrored by WorkerSession-backed paths without creating new decisions or Workbench action sidecars.
8. Run focused and full verification.

## Decisions

- New evidence stays in `agent-events.jsonl`; no separate `permission.json` or `external-execution.json`.
- Event names are `permission.profile.attached`, `permission.decision.recorded`, `external-execution.requested`, `external-execution.completed`, and `external-execution.failed`.
- Permission evidence is descriptive. ToolPolicyGate remains the policy authority.

## Module Boundary Plan

- Owner module: `src/runtime-continuity/`.
- New / moved responsibilities: typed Runtime Continuity event helper functions and event raw shapes for permission/external execution evidence.
- Facade touch points: code, validation, audit, and future WorkerSession-backed action boundary modules may call helper functions; they must not own the helper schema.
- Forbidden write-back locations: Workbench server/routes/UI, CLI command modules, broad manager facades, and ToolPolicyGate authority logic.
- Compatibility surface: existing Runtime Continuity artifacts and public run/validation/audit/action shapes stay unchanged.
- Boundary tests: runtime-continuity helper tests and module-boundary tests.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- `docs/STATUS.md` still described Phase 8V as active after close; this phase repairs the handoff drift first.
