# Spec: main-agent-old-seam-retirement-v2-action-normalization-bridge

## Goal

Centralize compatibility checks for the still-public `role.pipeline.*` main-agent execution actions behind a narrow normalizer so later old-seam retirement can rename or replace the public ids without scattered runtime assumptions.

## Users

- Maintainers continuing the main-agent orchestration migration.
- Workbench users who rely on current role execution controls continuing to behave the same.

## Acceptance Criteria

- AC-001: A shared helper exposes `normalizeMainAgentExecutionAction`, `isMainAgentExecutionAction`, and `isMainAgentExecutionStopAction`.
- AC-002: Runtime result summaries and concurrent-control stop bypass use the helper instead of local `role.pipeline.*` string-prefix checks.
- AC-003: Existing `role.pipeline.*` action ids still route to current main-agent orchestration handlers.
- AC-004: `rolePipeline` read-model compatibility and `MainAgentLoopProjection` non-executing behavior remain intact.
- AC-005: Dead old production seams remain absent: `runCodeValidateAuditSequence`, `runTaskQueueSequence`, and `task-queue-runner`.
- AC-006: No Scheduler, IntegrationCheck, apply, close, automation, confirmation queue, action registry, or ToolPolicy authority is added or changed.

## Non-Goals

- Do not register or emit `main-agent.execution.*` public action ids.
- Do not delete `role.pipeline.*`, `rolePipeline`, or `MainAgentLoopProjection`.
- Do not change Workbench UI labels, confirmation cards, right rail, transcript, or Agent graph.
- Do not execute or authorize Scheduler, IntegrationCheck, apply, close, remote, merge, PR, or Harness evolution.

## Constraints

- The helper must be pure and live with workflow action compatibility code, not Workbench UI code.
- Stop action normalization must preserve the conflict bypass behavior so a stop request can interrupt an active workflow action.
- V2 must be a compatibility bridge only; public action contracts remain unchanged.

## Risks

- Over-eager renaming could break action revalidation or existing Workbench handlers.
- Treating future canonical names as runnable in V2 could create a registry/handler mismatch.
- Removing `rolePipeline` or `MainAgentLoopProjection` now would break active projections and safety seams.
