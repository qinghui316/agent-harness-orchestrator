# Plan: main-agent-old-seam-retirement-v5b-remove-workpad-rolepipeline-read-model-output

## Approach

Remove the legacy field only at the Workpad read-model / DTO / Workpad UI
consumer boundary. Keep main-agent execution behavior and all Harness authority
boundaries unchanged.

## Implementation Steps

1. Remove Workpad `rolePipeline` from backend and Web DTO types.
2. Update `buildWorkbenchWorkpad(...)` to expose only `mainAgentExecution`.
3. Simplify backend/frontend main-agent execution accessors to canonical-only,
   or inline `workpad.mainAgentExecution` at call sites.
4. Update tests from V5a dual-field compatibility to V5b canonical-only output.
5. Add boundary assertions that Workpad public read-model/DTO/frontend consumers
   no longer read `rolePipeline`, while `role.pipeline.*` action aliases and
   internal demand-worker `rolePipeline` remain allowed.
6. Update handoff docs and V5a archive wording.

## Decisions

- Keep `WorkbenchMainAgentExecutionSummary` and `WorkpadMainAgentExecutionSummary`
  wire shape unchanged.
- Do not rename internal role execution builders unless required by type errors.
- Keep `role.pipeline.*` action aliases for V5c or later.
- Keep `MainAgentLoopProjection` for a later dedicated retirement decision.

## Verification

Run targeted Workbench read-model/UI/boundary/action suites, then standard
typecheck, lint, fast tests, build, Workbench aggregate, and Harness checks.

## No Open Gaps

Subagent review approved this narrowed scope. If implementation discovers an
external or persisted consumer of `center.workpad.rolePipeline`, stop and
convert V5b into deprecation-only rather than deleting the field.
