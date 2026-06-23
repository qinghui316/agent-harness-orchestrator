# Controlled Scheduler Loop Design Boundary

Status: Phase 12A design boundary. This document is an accepted implementation contract for later phases. It is not current runtime authority and does not add a scheduler loop, executor, Workbench action, ToolPolicy path, or source mutation path.

Positioning: this document defines only the future Scheduler loop boundary. It
is not the complete Goal-driven Workflow Loop architecture. The complete target
is recorded in `docs/CURRENT-DEVELOPMENT-PLAN.md` under
`Goal-Driven Workflow Loop Target`: the main Agent loops over current evidence
and may choose read-only planning, sequential workflow steps, low-conflict
parallel worktree slices, validation/audit, bounded rework, IntegrationFix,
waiting, or user clarification. Scheduler loop behavior is one bounded
execution strategy that the Goal Loop may call after the relevant evidence,
target ids, ToolPolicy checks, and human gates are satisfied.

## Purpose

AHO currently has Goal Loop evidence that can recommend one existing scoped scheduler gate at a time. That is intentionally not a scheduler loop. A future controlled Scheduler loop may repeatedly inspect current evidence, decide the next legal scheduler transition, and stop at human gates, but only if it remains bounded by AHO workflow truth.

This note defines the boundary a later implementation must preserve before it can introduce any loop runtime.

## Workflow Truth

The loop must not become workflow truth. Authority remains with:

- Change/ECL and accepted Spec/Plan/Tasks/AC.
- TaskGraph and accepted scheduler/decomposition artifacts.
- Run, Validation, Audit, Worktree state, and IntegrationCheck evidence.
- ToolPolicyGate and human Apply/Close gates.
- Harness evolution proposals, reviews, validation, results, and human apply/mark-complete gates.

GoalLoopDecision, GoalLoopNextStepPacket, controller policy, gate-readiness preflight, SchedulerRun, SchedulerRuntime sidecars, Workbench summaries, and this design note are evidence, projection, or future-runtime contracts only.

## State Machine

The future loop is an evidence-driven state machine:

```text
observe-current-evidence
-> assess-conflict-and-readiness
-> choose-one-legal-transition
-> require-human-confirmation-or-wait
-> dispatch-at-most-approved-scope
-> reconcile-recorded-evidence
-> route-quality-or-integration
-> stop-at-apply-close-or-blocked-gate
```

States:

| State | Meaning | Allowed output |
| --- | --- | --- |
| `observing` | Re-read Change, accepted artifacts, scheduler/runtime evidence, source state, validation/audit, IntegrationCheck, ToolPolicy policy, and Workbench-visible gates. | Evidence snapshot only. |
| `waiting` | Required evidence is missing, stale, superseded, cross-Change, or ambiguous. | Wait/block explanation. |
| `recommending-gate` | Exactly one current legal Harness transition is available. | Non-executing recommendation tied to required target ids. |
| `awaiting-human-gate` | The chosen transition is high impact or creates runtime/source-facing records. | Existing scoped action for human confirmation. |
| `dispatching-approved-scope` | A confirmed scheduler transition may start only the approved bounded scope. | One worker or one explicitly authorized future batch, never hidden continuation. |
| `reconciling` | Read existing run/worktree/worker evidence and write scheduler-owned evidence. | Result/validation/audit/rework/integration routing evidence. |
| `quality-routing` | Failed validation/audit routes to bounded rework, IntegrationFix, user direction, or blocked evidence. | No automatic source apply or merge. |
| `integration-barrier` | Multiple ready worktrees must combine through scheduler integration candidate and IntegrationCheck. | IntegrationCheck handoff or blocked evidence. |
| `terminal-handoff` | Source mutation, close/archive, remote landing, or Harness evolution is ready only through existing human gates. | Apply/close/remote/evolution confirmation evidence. |

## Authority Matrix

| Artifact / Surface | Owner | Authority class | Allowed outputs | Forbidden transitions |
| --- | --- | --- | --- | --- |
| Goal Loop decision / packet / controller / preflight | `src/goal-loop/` | Non-executing planning evidence | Recommendation, freshness, conflict posture, preflight evidence | Execute action, start worker, mutate source, bypass ToolPolicyGate or human gate |
| Scheduler planning contracts | `src/workflow-scheduler/` | Scheduler-readiness / dispatch-planning evidence | Contract, dry run, worker plan, claim plan, launch preflight, SchedulerRun shell | WorkerLease, WorkerSession, TaskRun, worktree, run, child Change, slot allocation |
| Scheduler runtime evidence | `src/scheduler-runtime/` | SchedulerRun-scoped runtime evidence | Runtime state, reconcile snapshot, claim reservation, worker start/result/validation/audit/rework/integration/completion/blocked records | Hidden loop, whole-wave dispatch, source apply, merge, close, Harness evolution |
| Worker execution sidecars | Code/run/runtime-continuity owners | Runtime auxiliary evidence | WorkerSession, RuntimeWorkspace, EventSource, AgentEventEnvelope beside real runs | Replace Run/Validation/Audit, override canonical scope, grant delegation |
| Validation and audit | `src/validation/`, `src/audit/` | Independent evidence gates | Mechanical validation and semantic audit records | Merge/apply authority, hidden approval |
| ToolPolicy/action dispatch | Workbench action dispatcher / ToolPolicy boundary | High-impact authorization/audit gate | Approve or deny one scoped action attempt | Pre-authorize future loop steps or skip human confirmation |
| IntegrationCheck and apply | Existing integration-check and apply owners | Combination/source-mutation gates | Aggregate compatibility, validation/audit evidence, apply readiness | Scheduler-owned apply/merge, direct source mutation |
| Workbench projections | Workbench read-model/frontend owners | Read-only projection | Human-readable current step, evidence links, enabled concrete gates | Own scheduler policy, create hidden actions, duplicate executable surfaces |

## Conflict Routing

The loop may consider parallel work only after evidence shows low conflict:

- distinct source scopes or explicitly compatible file/module ownership;
- accepted task/dependency evidence says the slices are independent;
- current worktree/source state is clean enough for isolated execution;
- required scheduler planning evidence is fresh and scoped to the selected Change;
- ToolPolicy and human confirmation can authorize the exact bounded transition.

High-conflict or uncertain slices must run sequentially, wait for predecessor evidence, enter bounded rework, enter IntegrationFix after failed integration evidence, or stop for user direction. Same-file edits, ordering dependencies, stale accepted artifacts, stale source hash, missing target ids, or ambiguous ownership are high conflict until proven otherwise.

Worktree isolation is only development isolation. It is not merge safety.

## Integration Barrier

Final combination must follow this route before source mutation:

```text
approved worker/rework outputs
-> SchedulerIntegrationCandidate
-> IntegrationCheck
-> aggregate validation/audit evidence
-> human apply gate
```

If IntegrationCheck, aggregate validation, or aggregate audit fails, the loop must route to IntegrationFix, bounded rework, user direction, or blocked evidence. It must not silently continue, apply a partial result, merge directly, or treat scheduler confidence as approval.

## Fail-Closed Rules

Before any future loop dispatches, reconciles, integrates, applies, closes, or evolves Harness state, it must fail closed on:

- stale accepted Spec/Plan/Tasks/AC or AC map hashes;
- stale, superseded, missing, forged, or cross-Change Goal Loop or scheduler artifacts;
- mismatched SchedulerRun, runtime state, reconcile snapshot, claim reservation, worker, validation, audit, integration candidate, IntegrationCheck, or worktree ids;
- missing ToolPolicyGate or missing human confirmation for high-impact transitions;
- source-root drift, dirty source state where a clean state is required, or worktree metadata mismatch;
- reference-derived behavior that is not accepted in AHO architecture.

## Module Ownership

Future implementation must extend owned modules first:

- `src/goal-loop/` owns loop recommendation policy and current-evidence reasoning.
- `src/workflow-scheduler/` owns scheduler planning, dispatch contracts, and launch-readiness evidence.
- `src/scheduler-runtime/` owns SchedulerRun-scoped runtime evidence, worker path progression, rework, integration candidate, completion, and blocked closeout records.
- `src/validation/` and `src/audit/` remain independent evidence gate owners.
- Existing ToolPolicy/action-dispatch boundaries own high-impact action authorization and audit.
- Existing integration-check/apply owners own combined-result proof and source mutation gates.
- Workbench read models and frontend panels only project evidence and concrete enabled gates.

New main implementation logic must not default into broad facades such as Workbench chat/server shells, frontend shell components, projection aggregators, CLI composition, type barrels, or manager facades.

## Reference Evidence

Loop Engineering supports the persistent objective loop and conflict-aware parallelism, but AHO keeps the loop as evidence policy rather than unattended authority.

Open Dynamic Workflows supports deterministic workflow artifacts, bounded leaves, pipeline/barrier semantics, and recovery journals, but AHO must not copy workflow scripts or treat journal/cache records as validation, audit, memory, or approval.

Symphony supports orchestrator-owned dispatch, reconcile, retry, blocked state, isolated workspaces, and dashboard projections, but AHO must not copy Linear-first state, unattended landing, or PR/merge assumptions.

## Phase 12A Non-Goals

Phase 12A does not implement:

- scheduler loop runtime;
- whole-wave dispatch;
- slot allocation;
- worker auto-start;
- new Workbench action, server route, CLI command, schema, or artifact writer;
- child Change creation;
- source apply, merge, close, or Harness evolution automation;
- ToolPolicy changes;
- changes to current Goal Loop single-gate recommendation behavior.
