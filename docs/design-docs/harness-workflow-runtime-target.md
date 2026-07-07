# Harness Workflow Runtime Target Architecture

## Purpose

This document is the target architecture for stable AHO multi-Agent work. It
replaces the long-term direction of extending fixed role chains, standalone
TaskQueue loops, standalone Scheduler loops, or fake planning-agent/subagent
protocols. The target is a high-cohesion, low-coupling
Harness-controlled Workflow Runtime.

This document is not an implementation record. It does not add a runner,
change schemas, start workers, repair the Plan handoff UI, or authorize any
execution path by itself. It is the architecture reference that later
implementation changes must follow.

## Current State

`src/workflow-runtime` is not yet the unified runner. It now owns the ordinary
`code.run` default code-change workflow and confirmed TaskQueue sequential
start/resume queue-level scheduling. Some kernel helpers and compatibility
facades remain. Real
scheduling behavior is still spread across:

- `src/main-agent-orchestration/` for the fixed TaskRun role-chain lifecycle;
- `src/task-queue/` for queue state records and item transitions;
- `src/scheduler-runtime/` for SchedulerRun-scoped worker path progression.

The fixed role chain is a safe V1 compatibility policy, not the final
architecture. `decideNextMainAgentOrchestration()` currently chooses
`coder-agent -> validator -> auditor-agent -> rework-coder`, but the target is
to retire that function as a runtime entrypoint and represent the same behavior
as the `default-code-change-workflow` template compiled into a graph.

`WorkflowGraphPlan` is also still sequential-TaskQueue shaped. Its current
`graphMode: "sequential-v1"` is an implementation limit. The target graph can
express sequential execution, ready sets, barriers, pipelines, and scheduler
waves, but this document does not change the schema.

Scheduler evidence is valuable and must remain. SchedulerContract, dry-run,
worker-plan, claim/reconcile, launch preflight, SchedulerRun,
ClaimReservation, worker start/result/validation/audit/rework/integration
evidence, IntegrationCheck, and human gates are retained. The part that should
not remain long term is an independent Scheduler runner separate from the
Workflow Runtime.

The earlier Plan handoff archive that introduced the first handoff card is not
the final correct state under this target. The later pending-composer repair
archive supersedes it for UI shape: pending actions belong in the main
composer slot, right-side Agent workspace remains a scoped conversation, and
execution/revision handoff is user intent for the main Agent rather than a
workflow action or permission grant.

## Final Layering

```text
Plan / Intent Layer
  Main Agent / Plan Agent / Skills / user handoff intent
  -> produce or revise WorkflowPlan draft
  -> user confirms

Artifact / Compiler Layer
  workflow-artifacts
  -> validate Change scope, artifact hashes, source scope, dependencies, policy preconditions
  -> compile WorkflowGraphPlan

Workflow Runtime Layer
  workflow-runtime
  -> create/resume WorkflowRun
  -> observe current graph/run/evidence
  -> compute ready-set
  -> apply dependency/barrier/pipeline/concurrency policy
  -> claim TaskRun/WorkerLease
  -> dispatch one or more leaf nodes
  -> append WorkflowRun events
  -> recover/pause/block/fail closed
  -> stop at human gate

Leaf Execution Layer
  task-run / code / validation / audit / integration-check / scheduler worker / future subagent leaf
  -> execute one scoped node
  -> emit typed evidence

Enforcement Layer
  ToolPolicyGate / code execution gate / worktree guards / scheduler scoped guards / human gates
  -> allow or deny exact scoped action

Projection Layer
  Workbench / CLI / docs / graph UI
  -> read evidence and display progress
  -> submit user intent
```

## Reference Mapping

Open Dynamic Workflows is the workflow algorithm reference:

- `runWorkflow()` maps to `HarnessWorkflowRunEngine`.
- A JavaScript workflow script maps to typed `WorkflowPlan` /
  `WorkflowGraphPlan` artifacts.
- `agent(prompt, opts)` maps to `LeafTaskRun`, `AgentTask`, `startCodeRun`,
  validation, audit, or another bounded leaf executor.
- `parallel()` maps to ready-set same-wave scheduling.
- `pipeline()` maps to independent item stage progression.
- `journal.jsonl` and `events.jsonl` map to `WorkflowRun` events plus AHO's
  stricter recovery key.
- `Executor` maps to Codex app-server or `codex exec` behind AHO leaf
  interfaces.

Symphony is the worker lifecycle reference:

- poll, dispatch, reconcile, retry, and blocked states map to Workflow Runtime
  scheduling and recovery policy;
- isolated workspace maps to AHO worktree, WorkerLease, and RuntimeWorkspace;
- runtime dashboard maps to Workbench projections.

AHO does not copy Symphony's Linear state, unattended landing, or auto-merge
assumptions.

Loop Engineering is the objective-continuation reference:

- persistent objective maps to Goal/Change plus evidence-aware continuation;
- conflict-aware parallelism maps to ready-set execution only after dependency,
  source-scope, and conflict checks;
- subagents, worktrees, skills, and connectors map to capabilities behind
  ToolPolicyGate and typed workflow artifacts.

AHO does not copy unattended confidence-based completion.

OpenAI Codex is the provider runtime reference:

- Codex is an executor and provider runtime boundary.
- Codex app-server and native subagents can provide live turns, provider
  events, child-thread projection, and future leaf/explorer capabilities.
- Codex goal/subagent state is not AHO workflow truth.
- AHO must consume real provider events and must not fake `planning-agent` or
  subagent events.

`desktop-cc-gui` remains a product-shell and UI reference. It is useful for
composer, pending-action placement, thread UI, panels, settings, and desktop
product polish. It is not Harness scheduling authority.

## Architecture Rules

### Owner First

Every new feature must declare an owner module before implementation. Feature
logic must not default into Workbench, server, frontend, CLI composition files,
type barrels, or broad manager facades. Facades may expose stable APIs,
aggregate projections, or bridge legacy entrypoints; they cannot own domain
policy.

### Single Runtime Owner

Multi-step, multi-Agent, multi-gate execution is owned by
`workflow-runtime`. TaskQueue, Scheduler, Goal Loop, Plan handoff, and future
agent teams must not each implement independent observe/decide/run/sync loops.
They may be workflow templates, modes, artifact inputs, projections, or leaf
executors.

### Leaf Means Leaf

A leaf executor executes exactly one node or stage. It may produce evidence and
return status. It must not choose the next node, mutate the graph, start a
sibling or child leaf, bypass ToolPolicyGate, bypass code execution gates, or
bypass human gates.

### Projection Is Not Authority

Workbench, server read models, web UI, conversation transcripts, right rails,
graph canvases, and cards are projections or intent surfaces. They do not own
workflow state transitions, scheduling policy, permission decisions, execution
truth, or completion truth.

### Artifacts Before Execution

WorkflowPlan and WorkflowGraphPlan artifacts must be confirmed and scoped
before execution. Compile validates `changeId`, accepted artifact hashes,
source scope, dependency graph, permission profile, recovery key inputs, and
stale-target state. Graph compile does not start execution.

### No Long-Term Compatibility Forks

Public action or API names can remain temporarily to protect UI and historical
records. Old internal runner logic cannot remain after the new runtime covers
the same behavior. Each implementation phase must include new-path takeover,
old-path deletion, and negative tests that prove the old runner is no longer
used.

### Skills Are Guidance, Not Enforcement

Skills can teach agents how to read `AGENTS.md`, `docs/ECL.md`, current
changes, `docs/STATUS.md`, and how to write legal WorkflowPlan drafts. Skills
cannot enforce permissions, allocate worktrees, approve gates, validate source,
or authorize apply/close.

## Testing Architecture

The testing model must converge with the runtime architecture. The goal is not
to remove unit tests; it is to test the owner instead of testing the same
observe/decide/run/sync behavior through every feature path.

`workflow-artifacts` owns compiler and input-validity tests. These tests cover
WorkflowPlan / WorkflowGraphPlan parsing, scope checks, accepted artifact
hashes, dependency validation, stale-target rejection, and illegal graph
fail-closed behavior. Graph compile tests must prove that compilation does not
start execution.

`workflow-runtime` owns scheduling scenario tests. These tests cover ready-set
calculation, dependency order, barriers, pipeline stage progression,
concurrency limits, pause/block/retry/recovery behavior, event append,
recovery-key reuse, and stopping at human gates. TaskQueue, Scheduler, Goal
Loop, Plan handoff, and future agent-team features should not each recreate
their own scheduler test harness for the same rules.

Leaf executors own leaf contract tests. Code, validation, audit, integration,
scheduler worker, and future Codex subagent leaves must prove that they execute
one scoped node or stage, emit typed evidence, respect ToolPolicyGate and human
gates, and do not choose the next node, mutate the graph, or start sibling /
child leaves.

Workbench, server, web, and CLI own boundary and projection tests. These tests
prove that user surfaces submit intent, perform boundary stale-target
revalidation where applicable, display projections from evidence, and do not
own workflow scheduling policy or completion truth.

End-to-end tests are still useful, but they should be sparse smoke tests that
prove `compiler -> runtime -> leaf -> projection` wiring works. They should
not duplicate every feature chain when the same owner-level contract already
covers the decision point. When a new runtime path replaces an old runner, the
implementation change must include negative tests proving the old runner is no
longer called.

## Module Ownership

`src/workflow-artifacts/` owns WorkflowPlan and WorkflowGraphPlan artifact
schemas, paths, hashing, guards, compiler, and rendering. It may read accepted
planning artifacts and compile graph input. It must not create WorkflowRun,
TaskRun, WorkerLease, worktree, Run, Validation, or Audit records, and must not
call Codex.

`src/workflow-run/` owns WorkflowRun repository, events, journal, recovery key,
scope guards, and summaries. It must not choose next nodes or dispatch workers.
Event payloads derive canonical scope from the persisted WorkflowRun.

`src/workflow-runtime/` owns `HarnessWorkflowRunEngine`, ready-set computation,
dependency/barrier/pipeline policy, runtime dispatch, pause/block/retry
routing, and recovery orchestration. It may depend on workflow-run, task-run,
leaf executor interfaces, and enforcement interfaces. It must not depend on
Workbench, web, or server UI types. It should expose a small facade for action
handlers and CLI entrypoints.

`src/task-run/` owns TaskRun and WorkerLease lifecycle, start/retry/reconcile,
and lease release. It does not decide the next workflow step.

`src/code/` owns `startCodeRun`, code execution gates, worktree setup, Codex
app-server / `codex exec` adapters, and code run artifacts. It acts as a code
leaf executor and does not schedule validation or audit itself.

`src/validation/` and `src/audit/` own independent validation and audit runs
and artifacts. They act as validation/audit leaf executors and do not approve
source mutation by themselves.

`src/workflow-scheduler/` owns scheduler planning evidence:
SchedulerContract, dry-run, worker plan, claim/reconcile plan, and launch
preflight. It becomes scheduler graph/compiler input and does not execute
workers after migration.

`src/scheduler-runtime/` is the short-term owner for existing SchedulerRun
evidence and worker paths. Long term it must not remain an independent runner.
Scheduler worker start, validation, audit, and rework become workflow-runtime
scheduler leaf executors. SchedulerRun evidence, ClaimReservation,
IntegrationCheck, and human gates remain.

`src/main-agent-orchestration/` is the current compatibility owner for the
fixed role chain. Long term it is retired as a runner owner. Any retained code
may only be template compilation, prompt/context helpers, or historical replay
readers.

Workbench, server, and web modules own user interaction, boundary stale-target
revalidation, action dispatch, and projection rendering. They must not own
workflow decision policy.

## Replacement Roadmap

Phase 1 is this documentation architecture closeout. It updates current docs,
reference maps, and system skill guidance only.

Phase 2 repairs the Plan handoff UI: remove the wrong top-of-transcript
`PlanHandoffCard`, remove full-access handoff intent, add a bottom
`ConversationPendingActionStack`, route execute/revise feedback to the main
Agent first, and keep the right workspace free for real Plan/child Agent
messaging without duplicate execute/question controls.

Phase 3 implemented `HarnessWorkflowRunEngine` for the default code-change
workflow. Ordinary `code.run` now routes through the runtime owner instead of
the old fixed role-chain entrypoint.

Phase 4 migrates TaskQueue into `concurrency=1` workflow mode. It deletes the
old queue-level `main-agent-orchestration` runner as an independent production
path. Historical TaskQueueRun and queue-decision records remain readable and
projectable; new queue-level execution goes only through Workflow Runtime.

Phase 5 migrates Scheduler into ready-set/wave/claim/lease workflow mode. It
moves worker start, validation, audit, and rework into scheduler leaf
executors, deletes independent start-first/start-next runner logic, and
preserves SchedulerRun evidence, ClaimReservation, IntegrationCheck, and human
gates.

Phase 6 projects true Codex native subagents. AHO consumes only real
`collabToolCall` / `collabAgentToolCall` events, links parent/child provider
threads for UI projection, deletes fake planning-agent projection, and keeps
Codex subagents outside Harness workflow truth.

## Non-Goals

- Do not implement `HarnessWorkflowRunEngine` in the documentation change.
- Do not change `WorkflowGraphPlan` schemas in this documentation change.
- Do not repair Plan handoff UI in this documentation change.
- Do not make Open Dynamic Workflows a dependency.
- Do not copy reference-project source code.
- Do not rewrite historical archive records.
- Do not preserve long-term dual runners after implementation phases replace
  them.
