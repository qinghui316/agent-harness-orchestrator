# Spec: main-agent-orchestration-legacy-facade-retirement-v1

## Goal

Remove the remaining production dependency on `runCodeValidateAuditSequence`
while keeping behavior equivalent. Main-agent orchestration should own bounded
role dispatch, but TaskRun, source-refresh, and remote feedback lifecycle owners
must keep their domain-specific responsibilities.

## Users

- AHO maintainers evolving the main-agent orchestration architecture.
- Workbench users indirectly, through unchanged Harness execution behavior.

## Acceptance Criteria

- AC-001: Production `src/**` has no imports, calls, or exports of
  `runCodeValidateAuditSequence`.
- AC-002: `src/main-agent-orchestration/` exposes explicit entrypoints for
  TaskRun attempts, source-refresh rework, and feedback rework.
- AC-003: TaskRun start/retry still finishes from the same top-level attempt
  result shape and preserves `taskIds`, `taskRunId`, and `executionGate`.
- AC-004: `result.refresh-rework` and remote/PR feedback rework still start
  from `rework-coder` instead of the default coder-first full runner.
- AC-005: No UI, confirmation queue, action type, automation allowlist,
  ToolPolicyGate, apply/close, remote, merge, PR, or Harness evolution authority
  changes.

## Non-Goals

- Implementing the future free-form continuous main-agent loop.
- Importing Open Dynamic Workflows runtime or making workflow scripts truth.
- Moving TaskRun or remote feedback lifecycle ownership into
  `main-agent-orchestration`.
- Renaming all read-model `rolePipeline` compatibility fields.

## Constraints

- Worker roles remain bounded leaves and cannot recursively delegate.
- Change/ECL artifacts, validation/audit, worktree state, and human gates remain
  workflow truth.
- New entrypoints may reuse existing leaf stages, ToolPolicyGate,
  RoleDispatcher, AgentTask lifecycle, live events, and result artifacts.
- The old facade name must not remain as an attractive production import.

## Risks

- Directly replacing all callers with `runMainAgentOrchestration` would break
  TaskRun finish/result extraction because the full runner returns
  `{ attempts: [...] }` rather than the old top-level attempt shape.
- Source-refresh and feedback rework could accidentally run a default coder
  pass instead of the required bounded `rework-coder` path.
- PR feedback rework could lose landing package, feedback snapshot, attempt, or
  Draft PR update gating if collapsed into a generic rework helper.

