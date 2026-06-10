# Spec: Phase 8U Runtime Continuity Contract Foundation

## Goal

Add AHO-owned runtime continuity evidence for code-run workers by persisting scoped worker session, runtime workspace, event source, and normalized agent event envelope artifacts. These records prepare AHO for future scheduler-backed workers without changing current execution behavior or workflow truth.

## Users

- Future AHO runtime implementers who need stable worker/session/workspace/event boundaries before adding parallel execution.
- Reviewers and maintainers who need evidence that code-run events are scoped to the owning Change, Run, role, and worktree.
- Workbench users indirectly benefit later; this phase adds no new UI surface.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8T closed and Phase 8U active.
- AC-002: `src/runtime-continuity/` owns WorkerSession, RuntimeWorkspace, EventSource, AgentEventEnvelope schemas/types, repository, guards, and append helpers.
- AC-003: Codex app-server code runs write scoped `worker-session.json`, `runtime-workspace.json`, `event-source.json`, and `agent-events.jsonl` without changing existing run artifacts.
- AC-004: Codex exec code runs write minimal scoped runtime continuity evidence without changing existing exec behavior.
- AC-005: Raw Codex/app-server events cannot override canonical `projectId/changeId/runId/roleId` scope in AgentEventEnvelope.
- AC-006: Direct read or append rejects cross-change, cross-run, cross-role, or misplaced runtime continuity evidence.
- AC-007: Runtime continuity initialization fails before worker start when required session/workspace/event-source evidence cannot be created; run-time envelope append failures are best-effort and recorded without replacing raw event logs.
- AC-008: `run.json`, existing event JSONL, Codex event artifacts, Workbench projection JSON, SSE, CLI output, action payload, decision/audit scope, and thread storage shapes remain unchanged.
- AC-009: Validation/Audit are not integrated into runtime continuity in this phase.
- AC-010: SchedulerContract remains non-executing and creates no TaskRun, WorkerLease, AgentTask, worktree, run, or child Change.
- AC-011: New runtime-continuity modules do not depend on Workbench, server, web UI, CLI command modules, or broad facade modules.
- AC-012: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- No parallel scheduler, parallel execution, worker pool, sandbox backend, remote worker, permission engine, Workbench UI, Workbench action, route, CLI command, ODWF runtime, child Change creation, or cache/replay.
- No migration of validation/audit/local command runners.
- No `run.json` schema change.
- No vendor-copying AgentScope or AgentScope Java implementation code.

## Constraints

- Runtime continuity artifacts are runtime auxiliary evidence, not workflow truth.
- Canonical workflow truth remains Change/ECL, accepted Spec/Plan/Tasks/AC, TaskRun/Run, Validation, Audit, Apply/Close human gates, and Harness evolution.
- V1 RuntimeWorkspace represents existing local worktree execution only.
- Permission coverage is a snapshot of existing role permission/sandbox profile, not a new permission engine.
- `README.md` remains unrelated and untracked.

## Risks

- Scope creep into parallel execution. Mitigation: tests assert no SchedulerContract execution artifacts are created.
- Event-shape churn. Mitigation: runtime continuity artifacts are additive; existing raw event files and SSE are unchanged.
- Mis-scoped normalized events. Mitigation: envelope helpers derive canonical scope from WorkerSession and reject conflicting append requests.
