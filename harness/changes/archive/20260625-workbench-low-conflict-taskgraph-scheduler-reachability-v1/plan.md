# Plan: workbench-low-conflict-taskgraph-scheduler-reachability-v1

## Approach

Reuse the existing typed workflow and scheduler chain. First make the low-conflict classifier stricter and testable; then ensure Workbench only surfaces the scheduler path through the existing controlled continuation and scoped automation boundary. If the controlled path cannot reach the next real scheduler gate, fix the smallest owner gap or record a blocker.

## Steps

1. Inspect current decomposition/readiness, scheduler contract, controlled continuation, automation allowlist, and Workbench projection paths.
2. Add/adjust bounded tests for low-conflict positive and negative readiness cases before changing behavior.
3. Implement minimal readiness/classification fixes in the planning/workflow artifact owner, not in Workbench UI.
4. Add projection/DOM tests proving controlled continuation is the only full-access scheduler surface and raw scheduler actions are not directly automated.
5. Run targeted suites, required project checks, and Harness checks.
6. Attempt E-drive real UI acceptance and record pass/blocker evidence.
7. Close and archive the change with handoff docs updated only for current baseline/next-step deltas.

## Decisions

- Plan generation remains manual; execution may use `完全访问权限` only after a real current gate exists.
- Raw `planning.scheduler.*` actions remain outside the automation allowlist.
- SchedulerContract is still readiness/typed input; execution proceeds through existing scheduler handlers and controlled continuation gates.
- Ambiguous scope is not low-conflict.

## Module Boundary Plan

- Owner module: planning/readiness logic in `src/workbench/planning/*` and typed workflow artifacts in `src/workflow-artifacts/*`; scheduler path stays in `src/workflow-scheduler/*` and `src/scheduler-runtime/*`; automation policy stays in `src/automation-runtime/*`; Workbench surface stays in read-model/frontend owners.
- New / moved responsibilities: no new framework; only strengthen existing scope/dependency classification and surface checks.
- Facade touch points: action facades may be used only for existing dispatch; new main logic must not be added to broad Workbench managers.
- Forbidden write-back locations: do not add new scheduler policy to `src/workbench/chat.ts`, `src/workbench/manager.ts`, or `App.tsx`.
- Compatibility surface: existing action ids, payload ids, Workbench JSON, and automation modes remain compatible.
- Boundary tests: planning/readiness tests, automation allowlist tests, read-model/DOM honesty tests.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: DecompositionPlan, DecompositionReadinessManifest, SchedulerContract, controlled scheduler continuation, current-gate revalidation, AutomationRuntime, confirmation queue, and IntegrationCheck.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new mechanism is proposed; gaps should be fixed in existing owners.
- Domain-specific logic location: low-conflict task classification belongs in planning/readiness builders and scheduler compiler guards.
- Shared cross-cutting logic location: stale target and action authority remain in current action revalidation / workflow action boundary owners.
- Local framework / state machine / projection / validation / gate avoided: avoid a second scheduler executor, direct scheduler automation allowlist, and feature-local permission checks.
- Future-cost reduction for similar features: gives later parallel work a clear low-conflict gate without teaching future agents to bypass the existing scheduler/action chain.

## Planning-Discovered Gaps

- Current deterministic decomposition often emits broad placeholder scopes such as `selected-demand` and sequential dependencies. The implementation must not treat those as low-conflict.
