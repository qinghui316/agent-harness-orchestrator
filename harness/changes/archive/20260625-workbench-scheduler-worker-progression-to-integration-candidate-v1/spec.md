# Spec: Workbench Scheduler Worker Progression To Integration Candidate V1

## Goal

Let an ordinary Workbench demand with an accepted low-conflict two-task plan progress through existing controlled scheduler gates until two worker worktree outputs are validated, audited, and reconciled into a same-Change `SchedulerIntegrationCandidate`.

## Users

- AHO user who wants one accepted demand to split into independent implementation slices without managing scheduler internals.
- Main agent / Workbench runtime that must keep execution scoped to the selected Change and current confirmation gate.

## Acceptance Criteria

- AC-001: Accepted low-conflict two-task planning artifacts can reach controlled scheduler progression without exposing raw scheduler actions as direct `完全访问权限` actions.
- AC-002: Each worker output is produced through existing worktree-backed Codex `code.run`, worker validation, and worker audit evidence.
- AC-003: Two approved same-Change worker outputs generate `SchedulerIntegrationCandidate(status = ready)` with matching `changeId`, `schedulerRunId`, claim reservation, worktree ids, validation/audit run ids, and source artifact hashes.
- AC-004: Cross-Change, stale, missing, forged, or source/artifact-drifted worker/candidate targets fail closed and do not produce a ready candidate.
- AC-005: Workbench user surface shows a user-readable controlled progression / integration candidate path, hides duplicate primary gates while running, and stops at the real human `planning.scheduler.integration-check.run` gate or blocker.
- AC-006: Source root is not modified before human IntegrationCheck/apply decisions.
- AC-007: The change records reference-project evidence and a Complexity Deletion Review proving no new workflow runtime, permission system, projection framework, or evidence family was added.

## Non-Goals

- Full parallel executor, slot allocator, whole-wave dispatch framework, child Change creation, raw scheduler action automation, automatic IntegrationCheck apply/discard, remote merge, PR, or Harness evolution.
- Replacing `confirmationQueue.primary`, scheduler runtime artifacts, validation/audit, ToolPolicyGate, or human gates with Goal Loop recommendations or UI state.
- Treating worktree isolation or a ready candidate as merge safety.

## Constraints

- Reuse existing owners: `scheduler-runtime`, `workflow-scheduler`, `automation-runtime`, Workbench confirmation/read-model, current-gate revalidation, and `integration-check`.
- Scheduler work under `完全访问权限` must still enter through `planning.goal-loop.controlled-continue.run` or an existing controlled wrapper.
- One loop execution remains scoped to one parent Change; next loop is a new Change.
- Real acceptance uses E-drive sandbox paths, not C drive and not the AHO development checkout as managed source.

## Risks

- Existing controlled continuation may already step through worker gates one at a time; overbuilding a wave executor would duplicate current owners.
- Slow scheduler suites can exceed ordinary tool windows; use targeted and split evidence if the aggregate times out.
- Codex worker output quality can block real acceptance; classify as Codex quality or bounded rework evidence, not fake success.
