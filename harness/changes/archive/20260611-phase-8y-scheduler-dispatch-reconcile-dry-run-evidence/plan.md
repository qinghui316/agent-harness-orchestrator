# Plan: Phase 8Y Scheduler Dispatch Reconcile Dry Run Evidence

## Approach

Build a small owned dry-run layer under `src/workflow-scheduler/`. The dry-run compiler reads a scoped SchedulerContract, computes evidence-only dispatch/reconcile verdicts, writes versioned/latest JSON and Markdown artifacts, and returns a summary for Workbench. Workbench action handlers, read-model projections, and UI cards remain thin adapters.

## Steps

1. Repair handoff drift for Phase 8Y active state in `AGENTS.md` and `docs/STATUS.md`, plus architecture/runtime/workbench/agent/boundary docs.
2. Add `SchedulerDispatchDryRun` schemas/types, paths, repository, renderer, and compiler under `src/workflow-scheduler/`.
3. Add strict action handling for `planning.scheduler.dispatch.dry-run`, including action registry, required target, high-impact/live/revalidation lists, target/scope helpers, server/frontend request types, and stale-target revalidation.
4. Add Workbench read-model summary and lazy projection for full dry-run detail.
5. Add frontend summary card/action display for "生成调度预演" without any parallel start/run/queue controls.
6. Add focused tests for valid dry-run, dependency waves, stale/cross-scope rejection, no-execution artifacts, action consistency, UI behavior, and module boundaries.
7. Run focused verification, then full product and Harness verification.

## Decisions

- Dry-run owner module: `src/workflow-scheduler/`.
- Artifact name: `SchedulerDispatchDryRun`.
- Action id: `planning.scheduler.dispatch.dry-run`.
- Slot language: use `estimatedMaxWaveWidth` / prerequisite warnings only; do not allocate or reuse DemandWorker slots.
- Runtime Continuity handling: dry-run records prerequisites only; it does not create `WorkerSession`, `RuntimeWorkspace`, `EventSource`, or `AgentEventEnvelope`.
- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, Apply/Close human gates, and Harness evolution.

## Module Boundary Plan

- Owner module: `src/workflow-scheduler/`.
- New / moved responsibilities: dry-run evidence compile, scope guard integration, artifact paths/repository, Markdown rendering, and summary helpers.
- Facade touch points: `src/workflow-scheduler/manager.ts` may re-export new owned modules; Workbench handler may call the owner module; read-model/frontend may display returned summaries.
- Forbidden write-back locations: no main implementation in `src/workbench/chat.ts`, Workbench projection facades, server route facades, frontend app shell, `src/workflow-runtime/code-workflow.ts`, CLI command modules, or existing domain manager facades.
- Compatibility surface: existing SchedulerContract compile/projection/action remains compatible; new action and lazy projection are additive.
- Boundary tests: assert new `src/workflow-scheduler/*` modules do not import Workbench, server, web UI, CLI command modules, or broad facades; assert no runtime execution artifacts are created.
- Follow-up split candidates: true parallel executor, scheduler recovery UI, worker-session projection, or permission UI are future phases only.
- If not applicable, reason: not applicable; this is a future feature and module-boundary coverage is required.

## Planning-Discovered Gaps

- Existing DemandWorker slot policy is demand-level only and must not be reused as TaskGraph scheduler capacity. Phase 8Y will report evidence-only max wave width / estimated worker pressure instead of allocating slots.
