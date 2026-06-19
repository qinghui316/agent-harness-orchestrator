# Plan: Workflow Scheduler Latest Artifact Guard Reuse

## Approach

Add a scheduler-domain guard owner and adopt it in the four scheduler artifact
builder modules that currently repeat identical latest id assertions. Keep
artifact reads and domain-specific status, lineage, and source-hash validation in
the existing modules.

## Steps

1. Add `src/workflow-scheduler/guards.ts` with a small pure
   `assertLatestSchedulerArtifact` helper.
2. Import that helper in `worker-plan.ts`, `claim-reconcile.ts`,
   `launch-preflight.ts`, and `scheduler-run.ts`.
3. Replace only the exact latest id checks listed in planning evidence.
4. Update focused boundary tests for helper ownership, representative adoption,
   preserved wording, and import independence.
5. Run targeted scheduler/workbench tests, product checks, and Harness checks.

## Decisions

- Reference projects are not needed because this is internal codebase
  convergence over an already implemented local pattern.
- The Workbench `active-target.ts` helper is intentionally not reused; it owns
  Workbench action target revalidation, while this change owns scheduler artifact
  validation.
- Scheduler runtime latest checks remain out of scope because they include
  runtime reservation/integration semantics rather than this pre-execution
  scheduler artifact chain.

## Module Boundary Plan

- Owner module: `src/workflow-scheduler/guards.ts`.
- New / moved responsibilities: latest scheduler artifact id assertion helper
  moves out of individual artifact builder modules.
- Facade touch points: none planned; `src/workflow-scheduler/manager.ts` remains
  unchanged unless a thin export proves necessary.
- Forbidden write-back locations: Workbench action helpers, server routes, web
  frontend, CLI command modules, scheduler runtime modules, ToolPolicyGate, Goal
  Loop, manager facade main logic, and reference projects.
- Compatibility surface: scheduler artifact JSON/Markdown shapes, exported
  compile functions, error wording, Workbench actions, and runtime behavior.
- Boundary tests: `tests/unit/workbench-module-boundaries.test.ts` or focused
  unit coverage for workflow-scheduler guard ownership and import boundaries.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: workflow-scheduler artifact
  validation and latest-artifact vocabulary.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing checks are repeated per artifact builder and no scheduler-domain
  owner currently exists for this assertion.
- Domain-specific logic location: status, lineage, schedulerMode, artifact-scope,
  and source-hash checks remain in each scheduler artifact builder.
- Shared cross-cutting logic location: latest artifact id assertion belongs in
  `src/workflow-scheduler/guards.ts`.
- Local framework / state machine / projection / validation / gate avoided:
  avoids repeating one-off latest id mini checks in every scheduler artifact
  phase.
- Future-cost reduction for similar features: new scheduler artifact phases can
  reuse one guard while preserving local domain checks.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
