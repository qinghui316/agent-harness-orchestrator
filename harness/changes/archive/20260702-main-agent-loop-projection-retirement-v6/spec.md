# Spec: main-agent-loop-projection-retirement-v6

## Goal

Remove the obsolete `MainAgentLoopProjection` Workpad/Web DTO seam so the
Harness-mode main-agent migration no longer exposes two parallel "main-agent
judgment" read paths. After this change, current Goal Loop evidence remains
available through its existing summary/readiness surfaces, and main-agent
orchestration evidence remains available through the new loop/replay/policy
owners.

## Users

- Developers maintaining AHO's main-agent architecture.
- Future agents reading the current handoff and Workpad DTO contracts.
- Workbench users indirectly, because duplicated hidden projection state no
  longer risks resurfacing in confirmation cards or transcript UI.

## Acceptance Criteria

- AC-001: `src/goal-loop/main-agent-loop-projection.ts` is deleted and no
  longer re-exported from the Goal Loop manager.
- AC-002: Workpad read-model and Web DTOs no longer declare or return
  `mainAgentLoopProjection` / `MainAgentLoopProjection`.
- AC-003: Tests assert the old projection seam is retired while Goal Loop
  summaries, current gates, feedback/preflight/close handoff, confirmation UI,
  and action bridge behavior do not regress.
- AC-004: `main-agent-orchestration` loop evidence, next-step evidence,
  WorkflowGraph replay/policy/backflow, Scheduler, IntegrationCheck,
  confirmationQueue, action registry, revalidation, automation allowlist,
  ToolPolicyGate, apply/close, remote, PR, merge, and Harness evolution remain
  untouched as authorities.
- AC-005: Current handoff docs state the old projection is retired and do not
  route future work back to projection retirement.

## Non-Goals

- Do not delete Goal Loop current capabilities or any durable Goal Loop
  evidence.
- Do not delete main-agent loop evidence, next-step evidence, action bridge
  request fields, WorkflowGraph replay/policy/backflow, controlled scheduler
  bridge/backflow, Scheduler runtime, or IntegrationCheck owners.
- Do not add UI, actions, permissions, scheduler automation, source mutation,
  apply/close, remote, PR, merge, or Harness evolution behavior.

## Constraints

- Delete by symbol and module boundary, not by broad Chinese/English wording.
- Keep historical archives unchanged.
- Preserve unrelated worktree changes, including the unrelated untracked
  `README.md`.
- Keep old `role.pipeline.*` inbound compatibility aliases out of scope.

## Risks

- Accidental Goal Loop regression if the projection deletion removes shared
  Goal Loop exports; mitigate with targeted Goal Loop and action revalidation
  tests.
- Workpad/Web type drift if one side still declares the field; mitigate with DTO
  and boundary greps.
- Documentation drift if current docs continue recommending this already
  completed retirement; mitigate with handoff updates.
