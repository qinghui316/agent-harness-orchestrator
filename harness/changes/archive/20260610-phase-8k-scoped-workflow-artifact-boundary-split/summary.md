# Phase 8K Scoped Workflow Artifact Boundary Split
## Purpose

Repair typed workflow artifact scope boundaries and split the remaining
`src/workflow-artifacts/manager.ts` implementation into owned domain modules.
Workflow artifacts must be bound to the Change directory that stores them:
misplaced or forged DecompositionPlan, DecompositionReadinessManifest,
TaskQueueProposal, or WorkflowGraphPlan records must fail closed before they
can appear in execution or UI projections.

This phase is a scoped guard fix plus refactor. It must preserve typed workflow
artifact paths, JSON shapes, Markdown semantics, Workbench projections, action
payloads, SSE/thread behavior, and Harness workflow truth.

## Scope

In scope:

- Repair post-8J documentation drift and record Phase 8K as active.
- Add workflow artifact Change-scope guards based on `changePath/change.json`.
- Apply guards to read/write/build/compile functions for DecompositionPlan,
  DecompositionReadinessManifest, TaskQueueProposal, and WorkflowGraphPlan.
- Split `src/workflow-artifacts/manager.ts` behind a compatibility facade into
  schemas/types, paths/ref resolving, hashing, guards, artifact repositories,
  compile/build services, and rendering modules.
- Add/extend tests for facade compatibility, forbidden reverse dependencies,
  scope mismatch rejection, hash normalization, and graph compile compatibility.

Out of scope:

- No runtime capability, CLI command, Workbench action, HTTP route, scheduler,
  parallel execution, multi-Change auto creation, ODWF JS runtime, or
  cache/replay.
- No intentional change to artifact paths, JSON shapes, Markdown semantics,
  Workbench snapshot/lazy projection shapes, action payloads, decision/audit
  scope, SSE events, or thread storage.
- No split of `workflow-run/manager.ts` or `change/manager.ts`.

## Current Status

Ready to close.

## Verification

Passed:

- `rg "Phase 8J is active|Current active phase: Phase 8J|harness/changes/active/phase-8j" AGENTS.md docs` returned no matches.
- `rg "Phase 8K|Workflow Artifact|WorkflowGraphPlan|TaskQueueProposal|DecompositionReadinessManifest|module boundary" AGENTS.md docs harness/changes/active`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Notes:

- `npm run lint` initially caught an unused type-only import after the split;
  it was fixed by changing the re-export to direct `export type`, and the
  rerun passed.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: one local lint retry after an unused
  type-only import; fixed and rerun passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
