# Spec: Phase 8K Scoped Workflow Artifact Boundary Split
## Goal

Typed workflow artifacts are currently stored under a selected Change path, but
the artifact layer does not uniformly prove that the artifact `changeId` matches
the owning `changePath/change.json`. Phase 8K makes that invariant explicit and
keeps it in the artifact domain rather than relying only on Workbench or runtime
callers.

The phase also splits `src/workflow-artifacts/manager.ts` into owned domain
modules so future WorkflowGraphPlan / TaskQueueProposal / readiness changes do
not keep accumulating in one mixed implementation file.

## Users

- Main-agent / Workbench users who depend on selected-demand planning,
  decomposition, readiness, TaskQueueProposal, and WorkflowGraphPlan artifacts.
- Future implementers adding workflow artifact behavior.
- Harness reviewers auditing that proposal artifacts cannot cross demand
  boundaries.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 8J closed, Phase 8K active, and no stale
  Phase 8J active/current claim remains.
- AC-002: Workflow artifact read/write/build/compile functions validate the
  owning Change scope at the artifact layer.
- AC-003: Cross-change, misplaced, or forged workflow artifacts fail closed and
  do not enter execution or UI projections.
- AC-004: `src/workflow-artifacts/manager.ts` is a compatibility facade rather
  than the primary implementation.
- AC-005: schemas/types, paths/ref resolving, hashing, guards, DecompositionPlan,
  DecompositionReadinessManifest, TaskQueueProposal, WorkflowGraphPlan, and
  rendering have clear module boundaries.
- AC-006: Artifact paths, JSON shape, Markdown semantics, source hash behavior,
  and latest pointer behavior are unchanged.
- AC-007: WorkflowGraphPlan compile still only generates versioned typed
  artifacts and never starts execution.
- AC-008: New `src/workflow-artifacts/*` modules do not import the facade,
  Workbench, server, web UI, or CLI command modules.
- AC-009: No runtime/action/route/CLI command/scheduler/parallel/multi-Change/
  ODWF JS runtime/cache replay is introduced.
- AC-010: Product and Harness verification pass, or any pre-existing failure is
  explicitly recorded.

## Non-Goals

- Do not change the public Workbench API, action union, action payloads,
  snapshot/lazy projection shapes, SSE events, or thread storage.
- Do not change typed workflow artifact paths or JSON/Markdown shapes.
- Do not split `workflow-run/manager.ts`, `change/manager.ts`, or runtime kernel
  modules in this phase.
- Do not promote DecompositionPlan, ReadinessManifest, TaskQueueProposal, or
  WorkflowGraphPlan to workflow truth.

## Constraints

- Continue excluding the unrelated untracked `README.md`.
- Preserve compatibility imports from `src/workflow-artifacts/manager.ts`.
- Use UTF-8 and avoid broad unrelated refactors.
- Preserve `hashFile()` behavior that ignores `generatedAt` in `ac-map.json`.

## Risks

- Scope guards can break projection reads if tests intentionally construct
  artifacts without a matching `change.json`; tests must create realistic Change
  directories or assert fail-closed behavior.
- Over-splitting could increase import churn; external callers should continue
  to use the facade in this phase.
- Rendering or path refactors can accidentally change artifact Markdown or
  latest pointer behavior; focused tests must pin representative outputs and
  refs.
