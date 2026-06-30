# Plan: main-agent-orchestration-legacy-facade-retirement-v1

## Approach

Add semantic entrypoints in `src/main-agent-orchestration/` around the existing
private attempt runner, then migrate the three remaining production callers away
from the legacy `workflow-runtime/kernel/role-stage-runner` facade. Keep
domain lifecycle ownership outside the orchestration owner.

## Steps

1. Add main-agent entrypoints for TaskRun attempt, source-refresh rework, and
   feedback rework.
2. Replace `task-run-sequence`, `result.refresh-rework`, and remote feedback
   rework call sites to import those entrypoints directly.
3. Stop exporting `runCodeValidateAuditSequence` and
   `runLegacyCodeValidateAuditFacade`; remove the old facade file if no longer
   needed.
4. Update tests and boundary assertions from "legacy facade exists" to
   "production code cannot use legacy facade".
5. Run targeted behavior and boundary tests, then aggregate verification.

## Decisions

- Use explicit entrypoints instead of one generic replacement so TaskRun,
  source refresh, and feedback rework keep their distinct lifecycle owners.
- Preserve the current fixed role sequence; this change removes an old control
  surface but does not implement freer decision-making.
- Do not add user-visible architecture context or Workbench UI.

## Minimality Gate Plan

- Can this be a no-op: no; production callers still import the legacy facade.
- Reuse: reuse existing leaf stages, orchestration state/decision engine,
  TaskRun manager, workflow action handlers, and remote handoff owner.
- Shared root fix: fix the remaining facade dependency instead of adding local
  guards at each caller.
- Avoided: no new runner framework, UI projection, action type, scheduler path,
  or provider abstraction.
- Smallest coherent change: migrate the remaining call sites and delete the old
  facade surface.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/`.
- New / moved responsibilities: semantic entrypoints for bounded role
  orchestration attempts.
- Facade touch points: `workflow-runtime/code-workflow.ts`,
  `workflow-runtime/kernel/task-run-sequence.ts`, Workbench action handlers, and
  remote handoff rework.
- Forbidden write-back locations: confirmation queue, action registry,
  automation allowlist, scheduler runtime, terminal, apply/close, PR/remote
  landing authority.
- Compatibility surface: TaskRun finish still receives the old top-level
  attempt result shape; read-model `rolePipeline` remains projection-only.
- Boundary tests: no production `runCodeValidateAuditSequence`, no exported
  `runLegacyCodeValidateAuditFacade`, and no new imports from forbidden owners.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: RoleDispatcher, ToolPolicyGate,
  AgentTask lifecycle, code/validation/audit run owners, and TaskRun/remote
  lifecycle owners.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism; this removes a compatibility facade and exposes existing
  orchestration ownership cleanly.
- Domain-specific logic location: TaskRun start/retry/finish stays in
  task-run/workflow-runtime; remote feedback stays in remote-handoff.
- Shared cross-cutting logic location: bounded leaf orchestration stays in
  `main-agent-orchestration`.
- Local framework / state machine / projection / validation / gate avoided: no
  new projection, state machine, validation gate, or workflow truth.
- Future-cost reduction for similar features: future continuous loop work can
  build on one owner instead of two sequence surfaces.

## Planning-Discovered Gaps

- The old facade currently has live callers in task-run sequence,
  `result.refresh-rework`, and remote feedback rework. Tests also currently
  assert the facade exists and must be updated.

