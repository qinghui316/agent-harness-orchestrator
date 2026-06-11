# Phase 8W Runtime Permission External Execution Evidence Contract

## Purpose

Phase 8W extends the Runtime Continuity Layer with normalized permission and external-execution evidence. The new evidence is written to the existing `agent-events.jsonl` stream next to `WorkerSession`, `RuntimeWorkspace`, and `EventSource` sidecars.

This is evidence hardening only. It does not introduce a permission engine, Workbench action, route, CLI command, UI projection, scheduler, parallel executor, child Change creation, ODWF runtime, or cache/replay behavior.

## Scope

In scope:

- Repair Phase 8V close handoff drift in docs.
- Add typed Runtime Continuity helpers for permission profile attachment, mirrored ToolPolicy decisions, and external execution lifecycle events.
- Record permission profile and external execution requested/completed/failed events for code, validation, and audit worker paths.
- Preserve existing lifecycle events, artifact shapes, CLI output, Workbench projections, ToolPolicyGate semantics, and workflow truth.

Out of scope:

- New permission engine or HITL permission prompt.
- Workbench action, HTTP route, CLI command, UI/lazy projection, or public artifact shape changes.
- Parallel scheduler, parallel TaskRun/WorkerLease/AgentTask creation, child Changes, sandbox backends, ODWF JS runtime, or cache/replay.

## Current Status

Ready to close.

## Verification

- Drift check: `rg "Phase 8V is active|Current active phase: Phase 8V|harness/changes/active/phase-8v|Active product phase: Phase 8V|Active implementation track: Phase 8V" AGENTS.md docs harness/changes/active` returned no matches.
- Positive drift/reference check: `rg "Phase 8W|permission.profile.attached|permission.decision.recorded|external-execution|Runtime Continuity" AGENTS.md docs harness/changes/active`.
- `npm run typecheck`
- Focused tests: `npm run test -- tests/unit/runtime-continuity.test.ts tests/unit/validation.test.ts tests/unit/audit.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
