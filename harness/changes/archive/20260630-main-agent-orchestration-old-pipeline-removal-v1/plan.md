# Plan: main-agent-orchestration-old-pipeline-removal-v1

## Approach

Create a new orchestration owner and move full-sequence control there. Extract
the existing role-specific side effects into leaf stage functions, then replace
the old workflow-runtime sequence with a compatibility facade.

The migration is intentionally behavior-preserving. V1 still delegates coder,
validator, auditor, and at most one rework, using the existing
`agent-task/orchestration-engine` decision contract. The difference is that the
decision loop sits in the new owner rather than inside a monolithic kernel
function.

## Steps

1. Read the existing monolithic runner and all current callers.
2. Add `src/main-agent-orchestration/leaf-stages.ts` with one-role leaf stage
   functions.
3. Add `src/main-agent-orchestration/runner.ts` with the internal observe /
   decide / run-one-leaf loop.
4. Replace `workflow-runtime/kernel/role-stage-runner.ts` with a thin facade
   that delegates to the new owner.
5. Update `workbench/demand-workers/orchestration.ts` to call the new owner.
6. Update compatibility tests and module-boundary tests.
7. Run targeted architecture, behavior, and Harness verification.

## Decisions

- Keep `agent-task/orchestration-engine` as the V1 pure decision engine.
- Do not delete the old exported function name yet; keep it as compatibility
  surface for task-run and rework call sites.
- Do not alter Workbench UI. Any visible change is a regression.
- Do not widen execution modes; `逐步确认` and `自动推进` keep existing gates.

## Minimality Gate Plan

- Can this be a no-op: no; the old monolithic runner would remain the real
  controller.
- Reuse: existing decision engine, role dispatcher, ToolPolicyGate, run creators,
  live events, boundary audit, maintenance ledger, action revalidation, and
  automation allowlist.
- Shared root fix: move ownership instead of adding another wrapper around the
  old runner.
- Avoided: new action type, new UI, new workflow truth, new provider branch,
  ODWF runtime, scheduler changes.
- Smallest coherent change: extract leaf stages and route the main worker
  through the new owner while preserving facade compatibility.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/`.
- New / moved responsibilities: sequence-level observation and decision loop.
- Facade touch points: `src/workflow-runtime/kernel/role-stage-runner.ts` and
  `src/workflow-runtime/code-workflow.ts` export compatibility.
- Forbidden write-back locations: Workbench UI, confirmation queue, action
  registry, automation allowlist, scheduler runtime, apply/close, remote, PR,
  Harness evolution.
- Compatibility surface: `runCodeValidateAuditSequence` retains legacy
  parameter support.
- Boundary tests: old facade-only checks, no old sequence call from demand
  worker, leaf stages no decision imports, decision engine no IO/action imports.
- Follow-up split candidates: free main-agent loop, journal/recovery, leaf role
  adapters, sequential recovery, scheduler/parallel integration.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: RoleDispatcher/ToolPolicyGate,
  AgentTask lifecycle, code/validation/audit run owners, boundary audit,
  maintenance ledger, live event sink, MainAgentDecision records, existing
  action revalidation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  existing monolithic kernel owns too much stage sequencing; a new owner is
  needed to remove that architectural bottleneck.
- Domain-specific logic location: leaf stage side effects remain in stage
  functions; sequence control moves to main-agent orchestration.
- Shared cross-cutting logic location: action safety remains in existing action
  and ToolPolicy owners.
- Local framework / state machine / projection / validation / gate avoided:
  avoided; V1 uses existing decision states and no new workflow truth.
- Future-cost reduction for similar features: later free-loop and scheduler work
  can replace the decision layer without rewriting role side effects.

## Planning-Discovered Gaps

None.
