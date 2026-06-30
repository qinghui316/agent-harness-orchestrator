# Plan: main-agent-workflowgraph-observation-evidence-queue-wrapper-drain-v1

## Approach

Introduce a narrow main-agent orchestration owner for WorkflowGraph observation.
It reads existing graph, queue, workflow, hash, and recovery evidence and writes
non-executing stage-level decisions. It does not own TaskQueue execution or
WorkflowRun state.

Drain old queue wrapper usage by changing production Workbench callers to invoke
`runMainAgentTaskQueueLifecycle` directly. Keep `runTaskQueueSequence` as a
compatibility-only facade for one more window.

## Steps

1. Add graph observation/evidence types, zod schema, writer, and reader.
2. Implement deterministic graph observation/decision from existing planning
   artifacts, TaskQueue state, WorkflowRun state, queue evidence refs, and
   recovery key freshness.
3. Record graph evidence after decomposition/readiness/proposal/graph compile,
   before queue start, and after TaskQueue lifecycle terminal/pause states.
4. Migrate Workbench action handlers away from `runTaskQueueSequence` imports.
5. Add architecture and behavior tests for no-execution, no-duplication, and
   wrapper-drain boundaries.
6. Run targeted and aggregate verification, then update handoff docs for close.

## Decisions

- Keep wrapper export this round; delete later only after import graph and
  downstream compatibility are intentionally closed.
- Store graph-level evidence separately from role `decisions.jsonl` and queue
  `queue-decisions.jsonl`.
- Treat stale hashes, mismatched ids, malformed evidence, or cross-change state
  as non-executable `stale` / `wait` evidence.

## Minimality Gate Plan

- Can this be a no-op: no; current queue evidence cannot explain pre-queue graph
  stages or graph-level recovery posture.
- Reuse: existing artifact hash, WorkflowRecoveryKey, TaskQueue, WorkflowRun,
  and WorkflowGraphPlan owners are reused.
- Shared root fix: the issue is a missing graph-level owner, not a single caller
  guard.
- Avoided: no new UI, no action bridge expansion, no scheduler executor, no
  second queue runner.
- Smallest coherent change: add stage-level evidence and drain one old
  production wrapper dependency.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/workflowgraph-observation.ts`.
- New responsibilities: graph-stage observation, non-executing decision evidence,
  and fail-closed reader.
- Facade touch points: Workbench planning handlers record evidence; existing
  workflow runtime facades remain state/recovery owners.
- Forbidden write-back locations: Workbench UI, confirmation queue,
  action registry, scheduler runtime, terminal, apply/close, automation allowlist.
- Compatibility surface: `runTaskQueueSequence` remains a thin facade.
- Boundary tests: import scans for forbidden modules and production wrapper use.
- Follow-up split candidates: final wrapper export removal; WorkflowGraph
  recovery/replay; scheduler dry-run/parallel integration.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `WorkflowRecoveryKey`,
  `readLatest*` workflow artifact readers, TaskQueue manager, WorkflowRun
  manager, main-agent loop evidence refs.
- Why existing mechanisms are insufficient: queue-step evidence starts after a
  queue exists and cannot represent missing or stale graph chain stages.
- Domain-specific logic location: graph-stage logic lives in the new owner.
- Shared cross-cutting logic location: hashes and recovery remain in existing
  workflow artifact/run owners.
- Local framework avoided: no generic workflow engine, no ODWF script runtime,
  no central action dispatcher.
- Future-cost reduction: future recovery, graph projection, and scheduler
  decisions can read one graph-level evidence stream instead of inferring state
  from mixed UI/action artifacts.

## Planning-Discovered Gaps

Subagent review found that deleting the `runTaskQueueSequence` export in this
change is premature. Production imports should be drained now; final export
removal should be a later cleanup after compatibility is proven.
