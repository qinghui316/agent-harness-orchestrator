# Runtime Model

## 1. Purpose

This document defines the AHO objects that future GUI, Workbench Snapshot, and orchestration work must share. AHO uses durable project memory and explicit artifacts; visual views are projections over those facts.

## 2. Object Model

```text
Project
  -> DemandConversation
  -> Topic(Change)
    -> Workpad
    -> Spec / Plan / Tasks / AC / Spec-Test
    -> TaskGraph
    -> CodingWorkPackage
    -> Topic Chat / Interaction Log
    -> Runs
      -> TaskRun / WorkerLease / AgentSession
      -> Agent Stream / Events / Artifacts
      -> Worktree / Validation / Audit
    -> AgentTaskRepository (future)
      -> Foreground AgentTasks
      -> Background Maintenance AgentTasks
      -> DelegateTaskRequest / MainAgentDecision
      -> ToolPolicyGate / ToolEventAudit / PostRunBoundaryAudit
    -> Approvals
    -> Archive / Evolution Evidence
      -> DemandMemoryCloseout
      -> MaintenanceLedgerEntry
      -> MaintenanceReviewRun
      -> EvolutionCandidate / CandidateScore / CandidateReview
```

## 3. Object Classification

| Object | Class | Notes |
| --- | --- | --- |
| Project | source of truth | Registry entry plus marker |
| Memory Store | source of truth | Repo-local, external-local, or future remote |
| DemandConversation | user-facing projection / interaction record | Project-scoped demand conversation bound to one internal Topic/Change/Workpad |
| ParentAgentTranscript | projection | Codex-style demand transcript; default UI text is generated only from real Codex runtime or exec replay cells for the selected demand |
| ParentAgentTranscriptCell | projection row | Phase 7A canonical conversation cell: user-message, assistant-message, process-row, evidence-row, or detail-only |
| DemandAgentRunGraph | projection | Selected-demand parent-agent delegation graph; explains role/tool/background work without replacing workflow truth |
| MainAgentDecision | runtime coordination/evidence record | Parent/orchestrator decision about the next role/tool action; not a human approval |
| MainAgentOrchestrationState | runtime coordination/projection record | Phase 7F in-memory role-step evidence used to choose the next default foreground role; not a durable source of truth |
| DecompositionPlan | proposal artifact | Phase 7H selected-demand planning proposal that records decomposition recommendation, units, dependencies, risks, and recovery key inputs; not executable workflow truth |
| DecompositionReadinessManifest | guardrail artifact | Phase 7I machine-checkable verdict for the latest confirmed DecompositionPlan; records whether later execution layers may consume the proposal and which guardrail blocks it; not executable workflow truth |
| TaskQueueProposal | pre-execution proposal artifact | Phase 7J typed proposal generated only from valid sequential taskqueue readiness; it describes a queue candidate and must not carry execution state |
| WorkflowGraphPlan | versioned typed execution input | Phase 7L immutable graph compiled from a matching TaskQueueProposal and DecompositionReadinessManifest. Sequential v1 nodes map proposal items to coder/validation/audit/bounded-rework stages. It is not an ODWF JavaScript script and does not start execution by itself |
| WorkflowRun | runtime coordination / recovery evidence | Phase 7K typed journal for confirmed sequential TaskQueue execution. Phase 7L binds it to versioned graph/proposal/readiness refs and hashes, not mutable latest files. It records queue/task progress and recovery keys, but Change/ECL, accepted artifacts, TaskRun/Run, validation/audit, apply/close, and human gates remain workflow truth |

Phase 7M does not add new runtime authority. It tightens the typed scope that moves through Workbench actions, ToolPolicyGate audit, server stale-target revalidation, and low-level TaskQueue resume. It also makes the action registry, strict scope matcher, required target validation, projection summaries, and runtime facade shared modules rather than repeated branches.

Phase 7N completed an implementation-boundary refactor over existing runtime semantics. Phase 7O continued that track by moving Workbench server route/live/projection helpers, projection builder groups, frontend types/panels/helpers, and selected chat action/live-transcript helpers into owned modules. Phase 7P kept the same behavior-preserving rule while moving action execution, high-impact target checks, and direct code / TaskRun / TaskQueue runtime sequence glue into action/runtime modules. Phase 7Q moved read-model DTO and UI panel boundaries. Phase 7R split the remaining oversized Workbench projection-builder implementation out of `read-model.ts` while preserving the existing read-model contract. Phase 7S split Workbench chat action/planning/Codex bridge/demand-worker helpers while preserving object authority, route shapes, action ids, recovery rules, JSON shapes, and runtime execution semantics. Phase 7T split frontend app shell/panel/transcript/rendering/payload/CSS boundaries without changing runtime semantics. Phase 7U split the workflow runtime kernel behind the existing `code-workflow.ts` facade; TaskRun, TaskQueue, WorkflowRun, StageResumeVerdict, code execution gate, and live event semantics remain unchanged. Phase 7V split residual read-model and confirmation queue builders; it changed builder ownership and confirmation copy only, not runtime semantics, projection JSON shape, action ids, route shapes, or workflow truth. Phase 7W split Workbench server/API adapter boundaries; it changed server module ownership only, not route shapes, HTTP JSON, SSE events, action semantics, projection JSON, thread storage, or workflow truth. Phase 7X split residual Workbench read-model builders out of `implementation.ts`; it changed builder ownership only, not projection JSON shape, lazy-loading semantics, action ids, route shapes, runtime semantics, or workflow truth. Phase 7Y split residual frontend Workbench shell and Workpad surface implementations; it changed frontend module ownership only, not HTTP/API shapes, SSE events, action payloads, live cache semantics, runtime semantics, or workflow truth. Phase 7Z completed CLI command registration and domain type ownership; it changed CLI/type module ownership only, not runtime semantics, Workbench behavior, HTTP/API shapes, SSE events, action payloads, or workflow truth. Phase 8A completed AgentTask / maintenance domain ownership. Phase 8B completed scoped Change Proposal boundary ownership; it changed proposal scoping and stale-accept guards plus module ownership only, while proposal artifacts remain candidates and workflow truth remains unchanged. Phase 8C completed code execution manager ownership: execution-gate, run-session, context, live-event, Codex app-server runner, Codex exec runner, artifact, and status modules now sit behind the `src/code/manager.ts` facade. It changed module ownership only, except for preserving resolved `roleId` metadata in Codex app-server code runs so rework-coder evidence is labeled correctly. Phase 8D keeps integration-check as source-apply preparation evidence: explicit requested `worktreeIds` must all resolve to ready targets, and integration-check internals move behind owned modules without changing artifact authority or workflow truth. Phase 8E keeps PR review, feedback, remote landing, and post-merge sync/cleanup as human-gated remote handoff evidence while moving their internals behind owned modules. Phase 8F keeps apply, landing package, Draft PR handoff, and landing queue evidence human-gated while moving their internals behind owned modules and aligning scoped Workbench target validation with the execution layer. Phase 8G keeps Spec-Test evidence as selected-demand AC evidence and proposal state: Workbench status/drift/proposal/generation must bind to the selected Change, while CLI legacy paths still fail closed when more than one active Change exists. Phase 8H keeps TaskQueue as typed runtime coordination evidence while tightening low-level start validation to require the same proposal, graph, readiness, decomposition, and workflow scope that the Workbench confirmation contract requires; it also moves TaskQueue internals behind owned modules. Phase 8I keeps DemandWorker as bounded demand-level coordination evidence while moving schema/type, repository, decision log, queue projection, slot policy, claim, lifecycle, and reconcile ownership behind the `src/demand-worker/manager.ts` facade. Phase 8J keeps TaskRun / WorkerLease as execution coordination evidence while requiring coder Run and workflow-result evidence to match the TaskRun's owning Change before it can update status or attach code/worktree links; it moves TaskRun internals behind the `src/task-run/manager.ts` facade. Phase 8K keeps typed workflow artifacts scoped to their owning Change directory: artifact reads, writes, builders, and graph compile must reject cross-Change or misplaced artifacts, while module ownership moves behind the `src/workflow-artifacts/manager.ts` facade. Phase 8L keeps WorkflowRun as recovery evidence while requiring read/list/event append/lifecycle sync paths to prove matching Change, WorkflowRun, and queue scope; it moves WorkflowRun internals behind the `src/workflow-run/manager.ts` facade. Phase 8M keeps Change lifecycle as workflow truth while requiring Change metadata to match its directory/index scope before status, close/abandon, Workbench projection, or thread import can trust it; it moves Change lifecycle internals behind the `src/change/manager.ts` facade. Phase 8N keeps Run as execution evidence while moving schema/type, artifact path, repository, event append, run id, context projection, local command runner, and guards behind the `src/run/manager.ts` facade. It does not add scheduler behavior, parallel execution, automatic child Changes, ODWF runtime, or cache/replay.

Phase 8O keeps Worktree metadata as isolation evidence while requiring filename id, JSON id, project id, and checkout root scope to match before status, projection, apply, remove, or mark-applied paths trust a record. It moves Worktree internals behind `src/worktree/manager.ts` without changing runtime authority, artifact shape, or apply semantics.

Phase 8P keeps Validation and Audit as scoped evidence gates while requiring directory id, artifact id, run id, and requested Change scope to match before direct read, accept, close gate, apply gate, spec-test, task reconcile, queue reconcile, or workflow stage resume paths trust a record. List/projection paths skip malformed or misplaced evidence; direct read/show/accept paths fail closed. Validation and Audit internals move behind `src/validation/manager.ts` and `src/audit/manager.ts` without changing artifact shapes, event shapes, CLI output, Workbench projections, runtime authority, or workflow truth.

Phase 8Q keeps Workbench action handling as UI/action orchestration, not workflow truth. It moves the residual handler map plus landing, PR, remote handoff, post-merge, landing queue, and conversation-control action glue out of `src/workbench/chat.ts` into owned handler modules. `chat.ts` remains the conversation facade and public compatibility entrypoint. This changes module ownership only; action ids, payloads, decision/audit scope, stale-target revalidation, ToolPolicyGate behavior, SSE/live events, thread logs, projections, and runtime authority remain unchanged.

Phase 8S introduces `SchedulerContract` as non-executing scheduler-readiness evidence. It can describe parallel candidate nodes and topological waves, but it cannot dispatch TaskRuns, create WorkerLeases, start agents, create worktrees, create child Changes, mutate source, or reuse cached LLM output. Later parallel execution must consume the contract through a separate scheduler phase and still preserve validation, audit, integration, and human gates.

Phase 8T adds AgentScope 2.0 and AgentScope Java Harness as references for a future Runtime Continuity Layer. `AgentSession` / `WorkerSession`, `RuntimeWorkspace`, `AgentEventEnvelope` / `EventSource`, permission / external-execution protocol, and recovery metadata are future runtime auxiliary records. They may make worker execution resumable, replayable, sandboxed, and permission-aware, but they do not become workflow truth. AHO must not jump from `SchedulerContract` directly to parallel execution until these boundaries exist.
Phase 8U adds Runtime Continuity Layer v1 for code runs. The code runner writes additive `worker-session.json`, `runtime-workspace.json`, `event-source.json`, and `agent-events.jsonl` artifacts next to existing run artifacts. These records normalize worker identity, local workspace boundaries, adapter event source, and worker events without changing `run.json`, Codex raw event logs, Workbench projections, or workflow truth. Canonical event scope comes from `WorkerSession`; raw Codex events cannot override `changeId`, `runId`, or `roleId`.

Phase 8V extends Runtime Continuity sidecars to validation and audit role-worker runs. Validation command runs use the `validation-command` adapter, audit Codex readonly runs use the `audit-codex-readonly` adapter, and `RuntimeWorkspace` can now represent either a `local-worktree` or the project `source-root`. These sidecars remain auxiliary evidence only: they do not alter Validation/Audit artifact shapes, run event shapes, CLI output, Workbench projections, or gate authority.

Phase 8W extends Runtime Continuity events without adding a new artifact surface. Permission profiles, mirrored ToolPolicy decisions, and external execution lifecycle records are written as normalized `AgentEventEnvelope` rows in the existing `agent-events.jsonl` stream. The canonical `projectId`, `changeId`, `runId`, `roleId`, optional worktree/task/workflow/queue/scheduler ids, `workerSessionId`, and `eventSourceId` still come only from `WorkerSession` / `EventSource`; raw payload cannot override them. These events are audit/replay evidence, not a permission engine, not a replacement for `ToolPolicyGate`, and not scheduler authority.

Phase 8Y introduces `SchedulerDispatchDryRun` as non-executing scheduler evidence derived from a scoped `SchedulerContract`. It records how a future scheduler would reason about waves, node readiness, dependencies, conflicts, source scopes, estimated max wave width, prerequisites, and blocked reasons. It is not a lease allocator, not a scheduler loop, not runtime state, and not workflow truth. It must not create `WorkflowRun`, `TaskQueueRun`, `TaskRun`, `WorkerLease`, `AgentTask`, worktree, run, child Change, or Runtime Continuity session artifacts.

Phase 8Z introduces `SchedulerWorkerSessionPlan` as non-executing worker-session/recovery evidence derived from a scoped SchedulerDispatchDryRun. It records planned worker stage scopes, role ids, workspace intent, adapter family, permission profile snapshots/references, event source expectations, and recovery-key inputs. It is not a WorkerSession, not a RuntimeWorkspace, not an EventSource, and not execution authorization; those sidecars are only written by real worker runs.

Phase 9A introduces `SchedulerClaimReconcilePlan` as non-executing scheduler coordination evidence derived from a scoped SchedulerWorkerSessionPlan. It records claim intents, planned worker keys, planned slot demand, source lock intents, wave reconcile checkpoints, blocked reasons, recovery-key coverage, and source artifact hashes. It does not allocate WorkerLeases, create WorkerSessions, write Runtime Continuity sidecars, start workers, or authorize parallel execution.

Phase 9B introduces `SchedulerLaunchPreflight` as non-executing launch-readiness evidence derived from a scoped SchedulerClaimReconcilePlan. It records launch status (`checked`, `blocked`, or `rejected`), claim/source-lock summaries, planned slot demand, runtime-continuity prerequisites, permission profile requirements, and future ToolPolicyGate / human-gate requirements. `checked` means the preflight evidence was generated, not that execution is authorized; a future executor must re-read scoped artifacts and re-run ToolPolicyGate and human confirmation before creating runtime records.

Phase 9C introduces `SchedulerRun` as a non-executing scheduler journal shell derived from a checked SchedulerLaunchPreflight. It records status (`prepared`, `blocked`, or `abandoned`), human-confirmation evidence, lineage ids back to SchedulerContract, source artifact hashes, future ToolPolicy/human gate requirements, and a scoped SchedulerRun journal. `prepared` means the recovery anchor exists; it is not a running scheduler, not a WorkerLease allocation, not a WorkerSession, and not execution authorization. SchedulerRun journal events derive canonical scope from the persisted SchedulerRun, so caller payloads cannot forge `changeId`, `schedulerRunId`, or scheduler lineage.

Phase 9D introduces SchedulerRun-scoped runtime shell sidecars: `SchedulerRuntimeState`, `SchedulerRuntimeEvent`, and `SchedulerReconcileSnapshot`. These records are owned by `src/scheduler-runtime/`, derive canonical scope from the persisted SchedulerRun, and do not change the SchedulerRun JSON shape. Runtime shell initialization means the scheduler has a recoverable state record; it still does not start workers, allocate WorkerLeases, create WorkerSessions, create TaskRuns, create worktrees/runs, or authorize parallel execution.

Phase 9E adds `SchedulerRuntimeClaimReservation` sidecars under the same SchedulerRun runtime shell. A reservation records the latest reconcile snapshot's reserved/blocked claim intents, source-lock reservation evidence, and optional supersession of an older snapshot reservation. It does not allocate a real slot, create a WorkerLease, create a WorkerSession, create TaskRun/worktree/run artifacts, or authorize worker execution.

Phase 9F adds a high-level Workbench action surface over the existing scheduler pre-executor and runtime-shell evidence. `planning.scheduler.plan.prepare` may generate or reuse the scoped SchedulerContract, DispatchDryRun, WorkerSessionPlan, ClaimReconcilePlan, LaunchPreflight, SchedulerRun, SchedulerRuntimeState, SchedulerReconcileSnapshot, and SchedulerRuntimeClaimReservation records needed to explain an intended parallel plan. A second invocation with the prepared SchedulerRun/snapshot/reservation scope records the user's overall launch intent and emits a plain-language launch brief. The runtime facts remain the underlying artifacts; the high-level action does not introduce a new workflow truth, does not mutate existing public artifact shapes, and does not create workers, WorkerLeases, WorkerSessions, RuntimeWorkspace/EventSource sidecars, TaskRuns, worktrees, runs, child Changes, scheduler loops, or parallel execution authorization.

Phase 9G adds scheduler worker-start runtime evidence for one coder-stage worker. The worker start is scoped to a latest SchedulerRun, RuntimeState, ReconcileSnapshot, and ClaimReservation, and code execution must use a scheduler-specific execution gate rather than single-change readiness or TaskQueue proposal authorization. The new facts may link one TaskRun, one WorkerLease, one worktree, one code run, and Runtime Continuity sidecars to the selected reservation intent. They do not imply whole-wave dispatch, validation/audit/rework start, automatic continuation, a scheduler loop, slot allocation, child Change creation, or replacement of Run/Validation/Audit/apply/close human gates.

Phase 9H adds scheduler worker-result runtime evidence for that first coder-stage worker. `SchedulerRuntimeWorkerResult` is derived from the scoped WorkerStart, TaskRun, WorkerLease, worktree metadata, and code Run facts. It requires the code Run to carry `executionGate.mode = "scheduler-claim-reservation"` and matching scheduler/task/run/worktree scope. Completed code evidence becomes `evidence-ready` scheduler worker result evidence, moves the TaskRun to `evidence-ready`, and releases the WorkerLease. Failed code evidence writes a failed result, marks the TaskRun failed, and releases the WorkerLease. Running code evidence returns a running summary without terminal result creation or lease release. Phase 9H does not start validation, audit, bounded rework, a next worker, a scheduler loop, apply, or merge.

Phase 9I adds scheduler worker-validation runtime evidence for that first coder-stage worker. `SchedulerRuntimeWorkerValidation` is derived from an evidence-ready `SchedulerRuntimeWorkerResult` plus matching TaskRun, code Run, and worktree metadata. The validation run must target the same worktree and must not fall back to source-root validation. Passed validation leaves the TaskRun `evidence-ready` so a later audit phase can decide completion; failed validation marks the TaskRun `blocked` with scheduler-owned evidence. Phase 9I does not start audit, bounded rework, a next worker, a whole wave, a scheduler loop, apply, or merge.

Phase 9J adds scheduler worker-audit runtime evidence for that same first coder-stage worker. `SchedulerRuntimeWorkerAudit` is derived from a passed `SchedulerRuntimeWorkerValidation` plus matching SchedulerRun, RuntimeState, latest ClaimReservation, WorkerStart, WorkerResult, TaskRun, WorkerLease, code Run, validation Run, and worktree metadata. The audit run must target the same worktree and exact validation id; unrelated generic validation/audit evidence must not be auto-bound. Approved audit can complete the TaskRun; blocked or failed audit blocks only the current scheduler worker path. Phase 9J does not start bounded rework, a next worker, a whole wave, a scheduler loop, apply, or merge.

Phase 9K adds scheduler worker rework planning evidence without execution. `SchedulerRuntimeWorkerReworkPlan` is derived from a failed `SchedulerRuntimeWorkerValidation`, or from a passed validation plus blocked/failed `SchedulerRuntimeWorkerAudit`, and binds the same SchedulerRun, RuntimeState, latest ClaimReservation, WorkerStart, WorkerResult, TaskRun, code Run, validation/audit evidence, and worktree metadata. It records a future same-worktree rework intent and required future gate, but it does not call `startCodeRun()`, create a new worktree, create a TaskRun or WorkerLease, start rework, or change Runtime Continuity sidecars.

Phase 9L adds scheduler worker rework start evidence for that first worker only. `SchedulerRuntimeWorkerReworkStart` is derived from a scoped `SchedulerRuntimeWorkerReworkPlan` and starts exactly one `rework-coder` code run through `executionGate.mode = "scheduler-claim-rework"`. The code run may pass `existingWorktreeId` only with this gate; all other code gate modes reject existing-worktree continuation. The rework run reuses the original worker worktree, creates a new rework TaskRun and WorkerLease for ownership, and leaves the original blocked TaskRun as historical evidence. Phase 9L does not create a new worktree, validate/audit/reconcile the rework result, start another worker, run a whole wave, run IntegrationCheck/apply/merge, or authorize final multi-worktree integration.

Phase 9M adds scheduler worker rework result reconcile evidence for that first rework run only. `SchedulerRuntimeWorkerReworkResult` is derived from `SchedulerRuntimeWorkerReworkStart`, the rework TaskRun, rework WorkerLease, target worktree, and rework code run. The reconcile path accepts only the `scheduler-claim-rework` code gate and matching scheduler/rework/task/run/worktree scope. Completed rework code moves the rework TaskRun to `evidence-ready` and releases the rework WorkerLease; failed rework evidence marks the rework TaskRun failed and releases the lease; running rework returns a non-terminal summary. Phase 9M does not validate, audit, start another rework, start another worker, create new worktrees/runs, or run IntegrationCheck/apply/merge.

Phase 9N adds scheduler worker rework validation evidence for that first rework result only. `SchedulerRuntimeWorkerReworkValidation` is derived from an evidence-ready `SchedulerRuntimeWorkerReworkResult`, the rework TaskRun, released rework WorkerLease, same reused worktree, and rework code run. The validation path accepts only the `scheduler-claim-rework` code gate and must run validation on the same worktree, never source-root. Passed validation keeps the rework TaskRun `evidence-ready`; failed validation marks it `blocked`. Phase 9N does not audit, start another rework, start another worker, create new worktrees/runs, or run IntegrationCheck/apply/merge.

Phase 9O adds scheduler worker rework audit evidence for that first rework validation only. `SchedulerRuntimeWorkerReworkAudit` is derived from a passed `SchedulerRuntimeWorkerReworkValidation`, the same reused worktree, the exact validation run, the rework TaskRun, the released rework WorkerLease, and the rework code run. The audit path accepts only the `scheduler-claim-rework` code gate and must bind audit to the Phase 9N validation id, never source-root or latest generic evidence. Approved audit can complete the rework TaskRun; blocked or failed audit blocks only the current rework path. Phase 9O does not start another rework, start another worker, create new worktrees/runs, or run IntegrationCheck/apply/merge.

Phase 9P adds scheduler integration candidate evidence after worker quality gates. `SchedulerIntegrationCandidate` is derived only from scheduler-owned audit `approved` / `approved-with-notes` outputs, including approved rework outputs when the original worker path was blocked. Each candidate output must pass the existing apply preview/readiness gate again; scheduler runtime evidence never bypasses apply safety. Fewer than two ready targets produces a waiting summary, not an IntegrationCheck or apply action. Phase 9P does not start workers, validation, audit, rework, IntegrationCheck, aggregate validation/audit, apply, landing, PR, merge, child Changes, new worktrees/runs, or scheduler loops.

Phase 9Q adds scheduler IntegrationCheck handoff evidence. `SchedulerIntegrationCheckHandoff` is derived from a latest ready `SchedulerIntegrationCandidate` and records the explicit ready worktree target set that was handed to existing IntegrationCheck. The handoff revalidates scheduler lineage, target readiness, source HEAD, diff hash, validation, and audit refs before calling the existing IntegrationCheck path. It does not apply/discard, land, merge, start another worker, or create a new integration engine.

Phase 9R adds scheduler integration outcome evidence. `SchedulerIntegrationOutcome` is derived only after re-reading the current IntegrationCheck and matching worktree metadata. A `passed` IntegrationCheck writes no outcome and remains under the existing apply/discard confirmation queue. An `applied` outcome requires IntegrationCheck `appliedAt` plus applied evidence on every target worktree. A `discarded` outcome rejects any applied evidence. Blocked outcomes mirror existing IntegrationCheck failure statuses. Phase 9R does not mutate the source root and does not create a second apply/discard path.
 
Phase 9S adds scheduler next-worker start evidence. A start-next action must re-read the SchedulerRun, RuntimeState, latest ReconcileSnapshot, latest ClaimReservation, prior worker paths, IntegrationCandidate, IntegrationCheck handoff, and scheduler outcome before it may create one additional coder TaskRun / WorkerLease / worktree / code run. It uses the existing `scheduler-claim-reservation` code gate and Runtime Continuity sidecars, but it does not start validation, audit, rework, result reconcile, IntegrationCheck, apply/discard, or a scheduler loop.

Phase 9T keeps those runtime rules intact and moves current-worker path and stale candidate decisions into scheduler-runtime helpers. It does not create new runtime artifacts; it only ensures UI/action surfaces select the current worker path and refresh stale `SchedulerIntegrationCandidate` evidence when newly approved worker outputs appear.

Phase 9U keeps the same runtime authority and proves the two-worker acceptance path over existing artifacts. A second worker still uses the existing scheduler worker-start/result/validation/audit facts, and refreshed `SchedulerIntegrationCandidate` evidence must be rebuilt before scheduler IntegrationCheck handoff can consume two ready worktrees. Phase 9U adds no new runtime artifact type, loop, slot allocator, whole-wave dispatch, source-root mutation path, child Change behavior, or full parallel executor.

Phase 9V keeps IntegrationCheck apply/discard authority outside the scheduler runtime. After scheduler handoff runs the existing IntegrationCheck path, a passed check remains waiting on the existing `apply-check.apply` / `apply-check.discard` confirmation. `SchedulerIntegrationOutcome` may only record the current result after re-reading the latest candidate, latest handoff, runtime state, IntegrationCheck state, and target worktree evidence. Phase 9V adds no scheduler apply/discard command and no new source-root mutation path.

Phase 9W extends the SchedulerRun runtime event journal to cover scheduler integration candidate, IntegrationCheck handoff, and terminal outcome evidence. Event scope is canonical from the persisted SchedulerRun and Change; payloads cannot override `changeId` or `schedulerRunId`. A passed IntegrationCheck that is waiting for apply/discard remains a returned summary and does not create terminal outcome evidence.
Phase 9X adds SchedulerRun terminal completion evidence derived from a terminal SchedulerIntegrationOutcome. Completion may mark the SchedulerRun as `completed` and write a completion sidecar/journal event for recovery, but it does not mutate source root or create a new apply/discard authority. A passed IntegrationCheck still waits for the existing apply/discard gate and cannot complete SchedulerRun until an applied, discarded, or blocked terminal outcome exists.

Phase 9Y validates the runtime surface rather than extending it: Workbench snapshots and lazy projections must recover scheduler candidate, handoff, outcome, and completion state from durable artifacts after reload. The existing IntegrationCheck apply/discard gate remains the only source-root mutation point; scheduler handoff, outcome, and completion actions are evidence/recovery transitions only.

Phase 9Z adds a terminal scheduler closeout evidence path for blocked/exhausted runs before IntegrationCheck. A closeout can only be recorded against the latest scoped SchedulerRun, runtime state, claim reservation, and SchedulerIntegrationCandidate when ready targets remain below the IntegrationCheck threshold and no legal next worker or existing integration handoff/outcome/completion path remains. It appends SchedulerRun-scoped runtime and journal evidence, but it does not allocate leases, create WorkerSessions, start agents, run IntegrationCheck, mutate source, or authorize apply/landing/merge.
| MainAgentOrchestrationStep | runtime coordination/projection record | Role result summary with selected input/output artifact refs, status, stoppedAt, and failure classification |
| MainAgentOrchestrationDecisionEngine | runtime policy | Deterministic next-step policy for the default coder/validator/auditor/rework template; does not replace ToolPolicyGate, AgentTaskResult, validation, audit, or human gates |
| DelegateTaskRequest | runtime request | Main-agent request to run a role task; must pass policy before dispatch |
| ToolPolicyDecision | evidence record | Broker/gate decision for AHO-owned actions: allowed, denied, needs-user-confirmation, or unavailable |
| WorkerPermissionProfile | runtime policy | Role-specific read/write/sandbox/delegation boundary used by policy and post-run audit |
| ToolEventAuditEntry | append-only evidence record | Records AHO-owned action/tool request, actor, target, decision, enforcement mode, and evidence refs |
| PostRunBoundaryAudit | evidence record | Run-after check over source/worktree/evidence boundaries; detects violations that sandbox/tool observation did not prevent |
| BoundaryViolation | evidence detail | Concrete source-root, denied-path, read-only role write, or cross-demand artifact violation |
| Change | source of truth | Business work unit |
| Workpad | projection plus durable notes | Default control surface for one Change; summarizes facts and next decisions without replacing ECL |
| IntakeScan | source of truth as run artifact | Read-only Spec-prep scan facts; does not mutate ECL or business source |
| IntakeIteration | interaction/evidence record | Deterministic current understanding and missing questions before Spec |
| ClarificationRequest | interaction/evidence record | User-facing question, answer, skip state; future Codex request-user-input bridge target |
| Spec / Plan / Tasks / AC / Spec-Test | source of truth | Accepted ECL artifacts |
| TaskGraph | derived/materialized workflow object | Future execution graph from accepted Plan/Tasks; nodes must link back to ECL task ids and evidence |
| CodingWorkPackage | projection | Recommended default coding assignment over accepted TaskGraph tasks; not a run/action/truth store |
| TaskRun | source of truth once recorded | One role-scoped execution attempt for one TaskGraph node |
| WorkerLease | runtime layer | Temporary claim that a worker/session owns a TaskRun; must reconcile after restart |
| AgentSession | runtime auxiliary | Codex app-server or other runtime session metadata |
| WorkerSession | runtime auxiliary evidence | Per-worker continuity record binding project, Change, Run, role, optional worktree/task/workflow/scheduler scope, permission snapshot, and event source; not workflow truth |
| RuntimeWorkspace | runtime auxiliary evidence | Local worktree or source-root workspace record for role workers: cwd, allowed roots, denied paths, and sandbox policy snapshot; cannot replace Worktree or source-root gates |
| AgentEventEnvelope | event/projection record | Normalized worker event envelope whose canonical scope comes from WorkerSession; replay input and auxiliary evidence, not workflow authority |
| EventSource | runtime auxiliary evidence | Source identity for replayable worker event streams, including adapter, session id, raw artifact refs, and status; must bind to Change/session/run scope |
| AgentTask | runtime coordination record | Parent-orchestrator delegation item for foreground role work or background maintenance |
| AgentTaskRepository | runtime coordination layer | Durable file-backed task surface for orchestrator-owned role/background tasks |
| AgentTaskResult | evidence/projection record | Task result that points to artifacts instead of living only in chat |
| AgentVisualState | projection | Future UI animation/activity state derived from TaskRuns, WorkerLeases, sessions, and run events |
| TaskQueueRun | runtime coordination record | Future user-confirmed queue execution over TaskGraph nodes; not task truth |
| TaskQueueItem | runtime coordination record | One queued task slot linked to a TaskRun when dispatched |
| IntegrationWorktree | source of truth once recorded | Future combined worktree proposal for multiple task worktrees |
| IntegrationRun | source of truth once recorded | Future attempt to build or update an integration worktree |
| MergeAttempt | evidence record | Future human-gated apply/merge attempt and result |
| AggregateValidation | source of truth as artifact | Future mechanical validation over an integration worktree |
| AggregateAudit | source of truth as artifact | Future semantic review over an integration worktree |
| IntegrationFixTaskRun | source of truth once recorded | Future repair attempt for merge conflicts or aggregate evidence failures |
| DocDriftFinding | evidence record | Future documentation/architecture drift finding |
| DocumentationReview | evidence record | Future review of documentation proposals and reference consistency |
| DemandMemoryCloseout | append-only evidence/projection record | Compact terminal-demand summary with evidence refs, user decision, changed files, lesson candidates, and doc drift hints |
| MaintenanceLedgerEntry | append-only evidence record | Low-friction event stream for archive/apply/failure/user-feedback/doc-drift/reference-drift/closeout signals |
| MaintenanceReviewWatermark | runtime coordination record | Tracks which terminal closeout window has been reviewed so five-change review windows do not repeat |
| MaintenanceReviewRun | evidence/projection record | Generated review report over hot closeouts, warm index, cold archive refs, doc drift, lessons, scores, and reviews |
| DocBudgetReport | evidence/projection record | Word-count and soft/hard budget signal for long-lived docs; may create refinement proposals but does not rewrite docs |
| EvolutionCandidate | proposal/evidence record | Candidate extracted from maintenance ledger, closeouts, archived evidence, or doc budget signals |
| CandidateScore | evidence record | Scorer output with dimensions, rationale, confidence, risk, and recommendation strength |
| CandidateReview | evidence record | Reviewer recommendation to accept, defer, reject, or request human review for a scored candidate |
| RoleScopedContextProjection | projection | Role-specific context boundary that prevents full maintenance memory from flowing to ordinary agents |
| ChangeTarget | runtime boundary | Capability-specific active Change target derived from Harness facts; not memory or workflow truth |
| RunnableChangeTarget | runtime boundary | Explicit or legacy-active target for code, validation, audit, TaskRun, local run, Codex run, spec-test, proposal, and agent runtime entrypoints |
| CloseableChangeTarget | runtime boundary | Explicit or legacy-active target for close, abandon, and apply auto-finalize |
| Context Projection | projection | Per-run scoped input packet assembled from Harness facts; not a memory store or source of truth |
| RoleContextPacket | runtime projection | Role-specific slice of AGENTS routing, permission profile, allowed inputs, constraints, and evidence refs |
| ChangeContextPacket | runtime projection | Change-scoped slice of accepted Spec/Plan/Tasks/AC and current decisions |
| EvidenceContextPacket | runtime projection | Explicit validation, audit, diff, apply, closeout, or feedback evidence refs selected for one run |
| Role Profile | source of truth | Bundled or future memory-scoped role definition |
| Agent Spec | source of truth | Future declarative role/subagent declaration |
| Run | source of truth | One execution attempt |
| Topic Interaction Log | source of truth for interaction history | Internal conversation log for one demand; Workbench SQLite records user/assistant/workflow messages, but not accepted requirements |
| Skill Source | source of truth | Memory-root `skills/{skill-id}/SKILL.md` plus references/examples |
| Agent Catalog | source of truth | Memory-root `agent-catalog.json` plus `agents/{role-id}.md`, with bundled profiles as defaults |
| Command Catalog | source of truth | Future memory-root command declarations for workflow entrypoints |
| Agent Runtime Bridge | runtime layer | AHO resolves role contracts and invokes Codex with bounded ECL context |
| Codex Bridge | runtime projection | Rebuildable materialized copy under Codex plugin discovery path |
| Worktree | source of truth | Isolated code proposal state |
| Validation / Audit | source of truth | Artifact-backed evidence |
| Artifact | source of truth | Durable evidence file |
| Thread View | projection | User-facing narrative assembled from facts |
| Agent Stream | projection | Live or replayed view over run events |
| Approval | derived view | Actionable item inferred from canonical state |
| GUI Snapshot | derived view | Read model for the workbench |
| Session | runtime auxiliary | Optional future runtime continuity, never a replacement for Change |

## 4. Key Boundaries

### DemandConversation

A DemandConversation is the user-facing work surface under a project. It owns the main conversation where the user states a demand, revises planning drafts, sees execution results, and gives follow-up feedback.

It is not workflow truth by itself. It binds to internal Topic/Change/Workpad state, and accepted ECL files, run artifacts, validation, audit, worktree state, and decisions remain authoritative.

Archived demand conversations are read-only for implementation work. A new implementation request after archive creates a linked follow-up conversation rather than mutating the old evidence chain.

### ParentAgentTranscript

ParentAgentTranscript is the Phase 6X center conversation projection. It is generated from user messages, app-server assistant output, workflow events, role/tool results, validation/audit, PR/landing/post-merge summaries, and lightweight maintenance notices.

Phase 6Y adds `ParentAgentTranscriptEvent` semantics to the same projection. Transcript rows distinguish user/main-agent messages, process events such as delegateTask calls and role returns, and evidence summaries such as validation/audit/PR/landing/maintenance results. Each row must carry source semantics: `codex-runtime`, `aho-orchestration`, `workflow-evidence`, or `maintenance`. AHO orchestration rows are readable process summaries, not verbatim private model reasoning.

Phase 6Z adds policy/audit events to the same transcript projection. `ToolPolicyGate` and `PostRunBoundaryAudit` events can appear as compact process rows, but they are not model private reasoning and not user decisions. AHO-owned actions use broker-enforced policy decisions. Codex/app-server/MCP events that AHO can observe are hook-observed and audit-recorded. Codex internal shell/write behavior that AHO cannot observe per-call is sandbox-audited through cwd/worktree constraints plus post-run status/diff checks; docs and UI must not promise stronger interception than the runtime exposes.

Phase 7A adds `ParentAgentTranscriptCell` as the canonical default row model for the Workbench conversation tab. Default conversation cells may be generated only from:

1. raw Codex app-server notifications, assistant deltas, and tool/item events;
2. `codex exec` JSONL and final-message replay.

Cell kinds are `user-message`, `assistant-message`, `process-row`, `evidence-row`, and `detail-only`. `assistant-message` cells represent visible Codex/main-agent output, not private reasoning. `process-row` cells compact real runtime/replay command, file-change, MCP/collab tool, review-mode, wait, and status events. `evidence-row` is reserved for evidence-like rows that appear in the real runtime/replay stream; AHO must not synthesize validation, audit, apply, PR, landing, or maintenance summaries into the default conversation. `detail-only` cells hold policy pass details, boundary pass details, raw logs, artifact paths, or other information that belongs in row details, graph details, or Agent Loop rather than the default conversation.

Phase 7B defines the `summary/details/source` boundary for cells. `text` is the user-visible compact summary only. It must not carry stdout/stderr, command output, tool results, diff previews, artifact paths, or worker final reports. Detail payloads may include `command`, `cwd`, `exitCode`, `stdoutPreview`, `stderrPreview`, `toolInput`, `toolResult`, `diffPreview`, and `evidenceRefs`, but the default transcript renderer shows them only after the user expands the row. Normal status, `turn/completed`, usage, `ToolPolicyGate allowed`, and `BoundaryAudit passed` update state or details only; denied/unavailable/violation states may become visible error cells when user action or trust is affected.

It is not workflow truth. Real assistant output may be shown as parent-agent message text. AHO workflow facts such as role returns, validation, audit, apply, PR, landing, policy/audit success, and maintenance closeouts belong in the run graph, node details, confirmation queue, or evidence drawers unless they are explicitly present in the Codex-visible runtime/replay stream. The projection must not show mechanical timeline labels such as `AI 回复`, `执行结果`, `证据摘要`, `结果摘要`, `Planning draft generated`, or `The confirmed workflow action completed`, and it must not expose raw run ids, provider JSON, or internal task/workflow terms in the primary conversation.

### Change

A Change is the internal auditable unit of work. It owns the accepted problem statement, plan, execution history, close gate, archive state, and evolution evidence. Users normally see it through the demand conversation.

### Workpad

Workpad is the primary internal Workbench read model for one Change. It may preserve durable notes such as current understanding, checklist state, blocker summaries, and handoff notes, but it is not the canonical spec, plan, task, validation, audit, apply, or close record.

If Workpad conflicts with accepted ECL files, accepted ECL wins until a human accepts a new proposal.

### IntakeScan / IntakeIteration / ClarificationRequest

Intake objects prepare the Change before Spec.

`IntakeScan` is a read-only Run artifact (`scan.json` / `scan.md`) that captures bounded project facts: repo status, manifest scripts, AGENTS/README, active/parked/archive change state, recent runs, validation/audit evidence, and likely source/test/config files.

`IntakeIteration` is an interaction/read-model record for current understanding, confirmed constraints, open questions, assumptions, and recommended next action.

`ClarificationRequest` is the common question model for AHO-generated deterministic questions and future Codex app-server `tool/requestUserInput` prompts. In Phase 5S, answering a clarification updates AHO's deterministic intake projection; it does not resume the same Codex turn because the app-server bridge is not implemented.

## AgentSession And App-Server Runtime Handles

`AgentSession` records a live or recently completed Codex app-server runtime handle:

- `projectId`
- `conversationId` / internal `changeId`
- `roleId`
- `runId`
- `threadId`
- `activeTurnId`
- `cwd`
- `sandboxPolicy`
- `status`

It is stored with run artifacts such as `agent-session.json`, `app-server-events.jsonl`, `app-server-stderr.log`, and `app-server-last-message.md`. It is not a source of workflow truth and must not replace demand conversations, accepted planning artifacts, validation/audit artifacts, worktree state, or apply/merge decisions.

Phase 6E uses AgentSession only for `planning-agent` and `coder-agent` turns. Steering is valid only while an app-server turn is active. If the adapter falls back to `codex exec`, user input is recorded as next-turn feedback instead of being presented as live steering.

### ResultReview

ResultReview is a Workbench projection over the current demand's worktree result:

- changed files and diff stat;
- latest matching validation result;
- latest matching audit result and notes;
- apply readiness from the existing worktree apply gate;
- evidence links.

It is not workflow truth. The source-of-truth objects remain worktree metadata, run artifacts, validation/audit artifacts, accepted audit evidence, apply/discard records, and close/archive decisions. `result.apply` is a user-facing handoff that delegates to the existing apply gate; it does not replace apply safety checks or imply PR/push/merge queue behavior.

Phase 6K adds a classified readiness projection for each selected result:

- `ready`: source is clean, HEAD still matches the worktree base, diff hash matches validation/audit, and evidence is valid.
- `source-drift`: the project changed after the result was produced; create a fresh same-demand rework attempt instead of applying or patching the old result.
- `dirty-source`: source root has uncommitted local changes; do not auto-rework through the coder.
- `stale-validation`: source did not drift, but validation is missing or stale; rerun validation first.
- `stale-audit`: source did not drift, but audit is missing or stale; rerun audit first.
- `not-approved`: validation or audit explicitly rejected the result; use the bounded rework policy.

Readiness actions must be scoped to an explicit `changeId + worktreeId + result/run id`. A global active change must never be used to infer the target.

None of these objects can replace accepted `spec.md`. They are evidence and preparation for a Spec proposal.

### ConfirmationQueue / IntegrationCheck

ConfirmationQueue is a Workbench projection over human-gate items. It is not a runtime dashboard. It may contain:

- execution confirmation;
- single result apply/discard/request-changes decisions;
- compatibility check confirmation for multiple ready results;
- apply/discard/request-changes decisions for a passed compatibility check;
- user-actionable maintenance suggestions.

It must not contain raw validation/audit process, worker slots, TaskRun/WorkerLease state, background maintenance logs, or internal problem lists.

IntegrationCheck is a local tool result introduced in Phase 6L. It creates a temporary integration worktree, applies selected ready result patches in stable order, and writes evidence such as `integration-check.json`, `summary.md`, and `combined.patch`. It does not modify the source root. A passed IntegrationCheck only creates a later apply confirmation; it is not an automatic merge.

Phase 6M extends IntegrationCheck with aggregate validation, aggregate audit, and bounded `IntegrationFixAttempt` records. IntegrationFix is scoped to combined-result failures only: patch conflicts, aggregate validation failures, or aggregate audit failures. It writes repaired integration artifacts and must re-run aggregate evidence before apply. It does not replace single-demand rework, does not overwrite individual demand evidence, and does not imply PR/push or a remote merge queue.

### LandingReadinessPackage / LandingReadinessReview

LandingReadinessPackage is a Phase 6N evidence/projection object created only after a single result or integration-check result has already been user-applied to the local source root. It binds explicit targets such as `projectId`, `conversationId/changeId`, `worktreeId/resultId/runId` or `applyCheckId`, source heads, source diff, changed files, apply evidence, validation/audit evidence, aggregate evidence, and IntegrationFix evidence when relevant.

LandingReadinessReview is produced by the read-only `merge-reviewer-agent`. It records a readiness verdict, risks, missing checks, evidence refs, and suggested next action. It cannot commit, push, create PRs, merge, apply source, edit docs, or replace human decisions.

Both objects are local landing evidence only. They do not replace apply records, integration checks, validation/audit, source diff, or human gates. They are the local foundation for a future PR/provider adapter.

### RemoteProviderCapability / PrDraftPackage

RemoteProviderCapability is a Phase 6O runtime projection over the local Git repository and GitHub CLI provider. It records whether a remote exists, whether `gh` is available and authenticated, the current branch, and a user-facing setup hint. It is not workflow truth and must not be used to fake remote operations.

PrDraftPackage is a remote handoff evidence object created from an explicit reviewed-ready LandingReadinessPackage. It writes `pr-draft-package.json` and `pr-body.md`. `pr-draft.prepare` is local-only and does not push or create a PR. `pr-draft.create` is a confirmed action that may create a local commit, push a remote branch, and create or update a Draft PR through GitHub CLI. It does not merge, land, push main, enable auto-merge, process PR feedback, archive the demand, or replace human gates.

### PrFeedbackSnapshot / PrFeedbackSummary / PrFeedbackReworkAttempt / PrDraftRevision

PrFeedbackSnapshot is remote PR evidence. It is produced by GitHub CLI PR reads and stores PR state, draft status, review decision, reviews, top-level comments, inline review comments, checks, thread capability, and branch refs. Raw GitHub JSON / REST / GraphQL output is an artifact for Agent Loop/details only and must not become main UI content.

PrFeedbackSummary is the parent-agent-readable projection over that snapshot. It classifies feedback as `no-action`, `checks-failed`, `changes-requested`, `inline-comments-actionable`, `comments-only`, `user-pushback-requested`, `provider-unavailable`, or `stale-pr`. Only actionable classifications create same-demand foreground AgentTasks. Comments-only and user pushback feedback return to the main conversation for user judgment or reply drafting.

PrFeedbackReworkAttempt records that actionable remote feedback was routed into the same demand's rework path. It is not a new demand and does not replace prior landing or PR evidence.

PrDraftRevision records a user-confirmed update to an existing Draft PR branch from a fresh landing package. It is a remote handoff artifact, not merge authority. It must not mark ready for review, resolve comments, merge, land, archive the demand, or change source truth by itself.

### PrReviewReadiness / PrReviewStateSnapshot / PrReviewHandoff

PrReviewStateSnapshot is Phase 6Q remote evidence over an existing Draft PR. It records PR open/draft state, review decision, feedback classification, comment count, failed check count, and evidence refs from the latest PR feedback read. Raw provider output remains under PR feedback artifacts and Agent Loop/details.

PrReviewReadiness is the parent-agent-readable projection that decides whether the right-side confirmation queue may show `提交人工评审`. It is submit-ready only when a real Draft PR exists, the provider is ready, the PR is still draft, and the latest feedback/checks do not contain failed checks, requested changes, stale PR, or provider-unavailable state. Comments-only may still be submitted after explicit user confirmation.

PrReviewHandoff records the confirmed ready-for-review transition. It is a remote handoff artifact only. It must not merge, land, push main, request reviewers, resolve review threads, enable auto-merge, archive the demand, or replace PR feedback evidence.

### PrReviewReplyDraft / PrReviewReplyHandoff / PrReviewThreadResolution

PrReviewReplyDraft is a Phase 6R proposal/evidence object that binds a user-confirmed reply body to an explicit PR, inline comment, issue comment, or review thread target. It may include `ReviewFeedbackUserContext` so the parent agent can carry user stance such as "按 reviewer 改" or "解释原因后回复" into the reply/rework context.

PrReviewReplyHandoff records a user-confirmed remote reply submission. PrReviewThreadResolution records a user-confirmed thread resolve mutation only when provider capability is detected. Both are remote handoff evidence. They must not merge, land, push main, request reviewers, enable auto-merge, archive the demand, or replace same-demand rework evidence.

### RemoteLandingReadiness / RemoteLandingAttempt / RemoteLandingResult

RemoteLandingReadiness is a Phase 6T projection over an existing PR draft/review handoff and provider state. It refreshes PR open/draft state, review decision, checks, actionable feedback classification, head/base refs, mergeability, and GitHub CLI provider capability. It can expose `合并 PR` only when the PR is open, no longer draft, checks have no failures, actionable feedback is clear, provider access is ready, and the selected landing/PR package is explicit.

PostMergeHandoff is a Phase 6U tool-result projection over `RemoteLandingResult(status=merged)`. It binds an explicit remote landing result, landing package, PR URL, and demand target to refreshed remote PR state plus local git state. It can summarize whether the local checkout is already synced, whether a fast-forward-only sync is safe, and whether the remote PR head branch can be cleaned up. It is not workflow truth and does not replace the remote landing result.

LocalSyncReadiness / LocalSyncResult are Phase 6U post-merge tool results. Sync readiness may expose `同步本地项目` only when the working tree is clean, the current branch is the PR base branch, the remote base can be fetched, and local HEAD can fast-forward to the remote base. The sync action may run `git merge --ff-only refs/remotes/<remote>/<base>` after user confirmation; it must not checkout, stash, reset, rebase, create merge commits, or run an implicit `git pull`.

RemoteBranchCleanupReadiness / RemoteBranchCleanupResult are Phase 6U post-merge tool results. Cleanup may expose `清理远端 PR 分支` only for a merged same-repo PR head branch that still exists and is not the base branch. It deletes only the remote branch after user confirmation and must not delete a local branch.

RemoteLandingAttempt records the user-confirmed attempt to merge a specific PR through the provider. In v1 the only supported provider action is GitHub CLI squash merge. It must not push main, enable auto-merge, delete the remote branch, bypass branch protection, or synchronize the local source checkout.

RemoteLandingResult records the provider outcome. `status=merged` is remote code evidence and may create `DemandMemoryCloseout` records with `terminalKind = merged`, append maintenance ledger entries, and refresh generated maintenance indexes/cache. `status=failed` records failure evidence only; it must not archive the demand, start automatic rework, or mutate curated stable memory. Both applied and merged closeouts may coexist for the same demand because they represent different stability boundaries.

### LandingQueueSnapshot / LandingQueueCandidate / LandingQueueResult

LandingQueueSnapshot is a Phase 6V project-level coordination projection over explicit PR handoff targets. It collects candidate PRs that already have landing package and PR draft evidence, refreshes each candidate through the existing `RemoteLandingReadiness` path, and records a readable queue summary. It is not workflow truth and does not replace PR packages, remote landing readiness, remote landing results, or demand closeouts.

LandingQueueCandidate binds `projectId`, `conversationId/changeId`, `landingPackageId`, `prDraftPackageId`, and `prUrl`. A candidate may be mergeable only when the refreshed remote landing readiness is `ready` or `ready-with-comments`. Failed checks, actionable feedback, draft/closed PRs, provider failures, stale state, and merge-unavailable states must remain explanatory queue items and must not expose merge actions.

LandingQueueResult records one user-confirmed queue merge attempt. It must refresh the selected candidate immediately before merge, merge at most that single PR, write the normal `RemoteLandingResult`, then refresh remaining candidates. It must not auto-merge the next PR, merge all candidates, push main, bypass branch protection, run post-merge local sync, or delete branches.

### DemandAgentRunGraph

DemandAgentRunGraph is a Phase 6W Workbench projection for the selected demand conversation. It has lanes for the parent agent, main role pipeline, integration/PR/landing/post-merge tools, and background maintenance. The `main-agent` node is the root; role agents, tool adapters, and maintenance agents are child nodes connected by delegation, return, evidence, rework, continuation, or background-maintenance edges.

The graph is read-only. It is generated from existing facts such as accepted planning artifacts, AgentTasks, AgentTaskResults, runs, validation/audit artifacts, result review, integration checks, landing/PR/remote landing records, post-merge handoff, and maintenance closeout/review artifacts. It is not workflow truth and cannot replace Change/ECL files, AgentTaskRepository, run artifacts, validation/audit, result review, PR packages, landing results, or maintenance ledger.

AgentTaskResult is the primary role-node record. Run artifacts for the same role are attached to node detail as evidence and must not create duplicate role nodes. Latest attempts appear in the graph; historical attempts stay in node detail. Background maintenance nodes may appear in a maintenance lane, but maintenance candidates do not enter the right confirmation queue.

### TaskGraph

TaskGraph is the future execution model for multi-agent work. It is derived or materialized from accepted Plan/Tasks and must preserve links to task ids, role ids, dependencies, assigned runs, evidence, and gates.

TaskGraph is not a frontend-only graph. If it becomes materialized, it must live under the resolved memory root and be rebuilt or checked against accepted `tasks.md` / `ac-map.json`.

### CodingWorkPackage

CodingWorkPackage is the default coding assignment projection. It groups the current Change implementation scope into the package a `coder-agent` should handle, while retaining TaskGraph tasks as checklist, AC coverage, progress, and evidence.

In v1 it is derived from accepted `tasks.md` / `ac-map.json` and TaskGraph evidence:

- unchecked tasks are the primary pending scope;
- checked tasks remain completed context and evidence;
- AC coverage and missing-evidence ACs are projected for review;
- split readiness is advisory only.

It does not create a package-level run, replace TaskRun/TaskQueue, or become workflow truth. Future parallel scheduling may split packages only after dependency/conflict and integration-worktree semantics exist.

### TaskRun / WorkerLease / AgentSession

TaskRun records one attempt to execute a TaskGraph node. WorkerLease is runtime ownership. AgentSession is runtime continuity.

None of these replaces Run artifacts or Change state. They exist so a future orchestrator can dispatch, retry, block, resume, and reconcile agents without losing the ECL audit trail.

Phase 8U introduces `WorkerSession` for code-run continuity. Phase 8V extends the same auxiliary evidence to validation and audit workers. Phase 8W records the attached permission profile and external execution lifecycle as normalized runtime-continuity events. A worker session binds a role run to project, Change, Run, role, optional worktree/task/workflow/scheduler scope, a `RuntimeWorkspace`, an `EventSource`, and a role permission snapshot. It still cannot authorize apply, merge, close, child Change creation, scheduler dispatch, permission bypass, or canonical artifact rewrites. Those transitions remain gated by accepted artifacts, ToolPolicyGate, validation, audit, and human confirmation.

### AgentTask / AgentTaskRepository / AgentTaskResult

AgentTaskRepository is the parent-orchestrator delegation surface introduced in Phase 6G.

Phase 6Y adds `AgentTaskRequest` and `RoleDispatcher` as the controlled delegation boundary. The main-agent can request roles through the `delegateTask` contract; AHO policy validates role, stage, demand scope, and permissions before creating an AgentTask. Worker roles are not orchestrators and must not call `delegateTask` or spawn subagents.

Foreground AgentTasks represent role work such as planning, coding, validation, audit, rework, and result review. Background AgentTasks represent maintenance work such as documentation scans, architecture drift scans, evolution candidate extraction, scoring, and review.

AgentTaskResult must point to artifacts. It must not exist only as hidden chat state. AgentTaskRepository is runtime coordination and evidence routing; it does not replace Change, Run, TaskRun, Validation, Audit, Apply/Close, or accepted docs.

The orchestrator records foreground role tasks for planning, coding, validation, audit, and rework handoffs. It must still respect human gates before source apply/merge, canonical document updates, ECL rule changes, or stable project memory updates.

### DemandWorkerQueue / DemandWorker / DemandWorkerAttempt

DemandWorkerQueue coordinates confirmed demand conversations at demand granularity. It is runtime coordination, not workflow truth.

Phase 6J makes demand worker slots bounded and configurable:

- default `maxConcurrentDemands` is 2;
- setting it to 1 preserves the earlier sequential behavior;
- one demand can have only one active worker attempt at a time;
- each active worker owns a distinct AHO-managed worktree/run/evidence chain;
- worker completion, failure, or needs-user-input state triggers orchestrator reconcile and may pump the next queued demand.

Demand workers do not replace AgentTask, Run, Validation, Audit, Result Review, or Apply/Close decisions. They only decide which independent demand conversations may run at the same time.

### TaskQueueRun / TaskQueueItem

Task queue objects coordinate execution over accepted TaskGraph nodes. They do not define the tasks themselves and do not replace `tasks.md` or `ac-map.json`.

A queue item may become a TaskRun when dispatched. If a queued task blocks, the queue records where execution stopped and why. Reconcile must rebuild queue visibility from TaskRun, WorkerLease, Run, Validation, and Audit artifacts.

### IntegrationWorktree / IntegrationRun / MergeAttempt

Integration objects represent future combined proposals across multiple task worktrees. They are not source-tree changes until a human applies or merges them.

An IntegrationRun creates or updates an IntegrationWorktree. A MergeAttempt records a human-gated apply/merge attempt and result. Merge failure is evidence and may create an IntegrationFixTaskRun.

### AggregateValidation / AggregateAudit / IntegrationFixTaskRun

Per-task validation and audit are not enough for merged changes. AggregateValidation and AggregateAudit are future artifacts over the integrated result.

IntegrationFixTaskRun is a scoped repair attempt for merge conflicts, aggregate validation failures, or aggregate audit blockers. It produces repair evidence and must be re-validated and re-audited.

### DocDriftFinding / DocumentationReview

Documentation and architecture consistency are future AHO-maintained evidence streams. A Documentation Agent or Architecture Agent may produce findings and proposals, but accepted documents remain canonical only after a human-gated action.

### DemandMemoryCloseout / MaintenanceLedgerEntry / MaintenanceReviewRun

DemandMemoryCloseout is the compact terminal-demand memory record produced when a demand reaches a terminal outcome such as archived, applied terminal, remote handoff terminal, or future merged terminal. It summarizes the demand goal, final result, user decision, changed files, affected modules, evidence refs, reusable lesson candidates, docs drift candidates, and memory boundary notes.

MaintenanceLedgerEntry is the append-only event layer for self-evolution signals. It may record archive events, apply events, terminal closeouts, repeated failures, user feedback about process/doc drift, reference drift, and STATUS/AGENTS inconsistency.

MaintenanceReviewRun is the five-terminal-change consolidation output. It reads only maintenance inputs: the hot window of five closeouts, a warm index of recent closeouts, cold archive references, current docs, doc drift snapshots, failures, PR feedback, user corrections, and existing candidates. It writes review artifacts, scores, reviews, generated index/cache, and proposals only.

### EvolutionCandidate / CandidateScore / CandidateReview / DocBudgetReport

EvolutionCandidate is a curated proposal extracted from the ledger, closeouts, archived evidence, or doc budget signals. Phase 6S extends the existing candidate model with subtypes and fingerprints instead of creating a parallel maintenance-candidate system.

CandidateScore is a scorer artifact. It may score evidence strength, reuse value, repeated occurrence, current docs coverage, stale/misleading risk, and whether lint/test/ECL would be better than prose memory. CandidateReview is an independent recommendation: accept, defer, reject, or needs-human-review.

DocBudgetReport is a guardrail over long-lived docs. Soft budget overflow creates a candidate for scoring. Hard budget overflow may create a doc-refinement maintenance task/proposal. Neither case rewrites canonical docs automatically. Only explicitly marked generated sections/caches may be replaced automatically.

None of these may directly modify `AGENTS.md`, `docs/`, ECL rules, product roadmap, source root, or `project/stable` memory.

This follows AgentScope Java's two-layer memory pattern: low-friction append-only evidence first, curated and reviewed long-term memory second. The current `harness/evolution/pending.md` and `archive_threshold=5` mechanism remains a lightweight compatibility trigger, not the final background maintenance architecture.

### RoleScopedContextProjection

RoleScopedContextProjection is the boundary between maintenance memory and role execution. Maintenance roles may read hot/warm/cold maintenance inputs. Ordinary roles receive only their role-scoped context: current demand, accepted artifacts, compact stable memory, explicit evidence, and selected related lessons. Coder, validator, auditor, and merge-reviewer roles must not receive the full maintenance store by default.

### Context Projection

Context Projection is the runtime packet that tells an executor what it may consider for one run. It is not a durable memory database and must not be called `Memory Projection`.

The packet may include `AGENTS.md` as the routing map, a current Change summary, accepted Spec/Plan/Tasks/AC, role constraints, selected evidence refs, and narrow project facts. Phase 7E materializes that shape as `RoleContextPacket`, `ChangeContextPacket`, and `EvidenceContextPacket`; those packets remain projections from Harness truth.

Ordinary worker roles must not receive the full parent conversation, full archive history, maintenance review windows, raw stdout/stderr/jsonl, or all project memory by default. Maintenance roles may receive broader maintenance windows only through explicit role-scoped projection.

Every mutating run must carry an explicit `changeId`. Worktree creation, diff collection, validation, audit, apply, closeout, and future merge/readiness actions must remain traceable to that Change. Global active-state fallback is acceptable only for legacy compatibility paths that are explicitly documented and must not be used for high-impact target selection.

Phase 7E writes `context-packet.json` and `context.md` for core role runs. `context-packet.json` is the structured audit copy and records role id, `changeId`, goal, token budget, permission profile, Change summary, selected evidence refs, included sources, and excluded sources. `context.md` is the model-facing rendering. Run metadata records the packet ref/hash so validation, audit, and rework can prove which context the worker saw.

### ChangeTarget

Phase 7D adds ChangeTarget as the first runtime boundary before scoped execution or closeout mutation. A ChangeTarget is resolved from existing Change/ECL facts and carries `changeId`, the scoped `ChangeStatus`, target `source`, and capability. It is not a memory store, not a Workpad, and not a substitute for Context Projection.

`RunnableChangeTarget` is used by code, validation, audit, TaskRun, TaskQueue, local run, Codex run, spec-test, proposal, and agent runtime entrypoints. `CloseableChangeTarget` is used by close, abandon, and apply auto-finalize. Explicit `changeId` targets resolve only active Changes. Legacy active fallback remains available for CLI-compatible paths and rejects zero or multiple active Changes.

### Run

A Run is one attempt against a ChangeTarget and, for core role runs, one RoleContextPacket. A Change may contain many Runs. A failed, cancelled, or interrupted Run does not rewrite the Change; it adds evidence to it.

### Session

If a future runtime adapter exposes sessions, they may help resume a process or thread. They remain runtime auxiliaries. They do not become the product kernel and must not replace Change as the durable work unit.

Phase 5D uses Codex session ids only as a runtime continuity optimization for ordinary Topic chat. If Codex cannot expose or resume a session, AHO rebuilds the prompt from Topic context and canonical memory. The session id is never a project fact.

Phase 8U starts the broader Runtime Continuity Layer with code-run evidence, Phase 8V covers validation/audit role-worker evidence, and Phase 8W adds permission/external-execution event evidence. `RuntimeWorkspace` describes either an existing local worktree workspace or the project source-root workspace and allowed roots; it does not implement Docker, E2B, remote sandboxing, or a new permission engine. `AgentEventEnvelope` / `EventSource` normalize Codex app-server, `codex exec`, validation-command, audit-Codex-readonly, permission-profile, and external-execution lifecycle events beside raw logs. Future child, tool, permission, and runtime replay can extend this layer, but the records remain adapter and replay boundaries, not a new source of workflow truth.

### Topic Interaction Log

The Workbench SQLite store records the GUI conversation and workflow narration for one active Topic. It may contain user messages, assistant replies, workflow action events, proposal pointers, approval decisions, and run/artifact references. Legacy `thread.jsonl` files can be imported for compatibility.

The interaction log is useful for continuity and the Workbench Thread View, but it does not replace accepted ECL files. If chat says one thing and `spec.md` says another, `spec.md` wins until a human accepts a new proposal or edits the canonical file.

### Skill Source and Codex Bridge

AHO skills are project memory. Their source lives under the active memory store:

```text
skills/{skill-id}/SKILL.md
skills/{skill-id}/references/
skills/{skill-id}/examples/
```

The Codex bridge materializes enabled skills into an AHO-managed Codex plugin namespace. That bridge is a runtime projection. It can be deleted and rebuilt from AHO memory and SQLite skill enablement. Codex global or native skills may exist, but they are not AHO project truth.

### Agent Catalog and Runtime Bridge

AHO agents are declarative role contracts. AHO chooses the role, validates its write capability, wraps the role Markdown with ECL context, and starts a scoped Codex run. This follows the oh-my-codex pattern of `agent_role -> role Markdown -> codex exec`, but keeps AHO Change, approval, run, and artifact records as the durable truth.

The agent bridge records role id, role hash, catalog hash, available skill ids, and bridge status on each Codex-backed run. It does not claim a skill was actually used unless Codex output later provides observable evidence.

### Thread View

Thread View is a narrative projection over user messages, accepted artifacts, proposal artifacts, runs, and decisions. It is allowed to look conversational, but it cannot outrank the canonical files behind it.

### Approval

Approval is not a separate workflow store. It is derived from state such as:

- proposal exists and is acceptable;
- worktree has matching validation and audit evidence;
- Change is close-ready;
- evolution proposal awaits human approval.

Accepting an approval mutates the underlying canonical object, not the inbox item.

## 5. Workspace Relationship

AHO follows a workspace-like model without embedding a custom in-process agent runtime:

- `AGENTS.md` routes.
- Memory Store preserves durable project facts.
- Context Projection prepares scoped executor input.
- Runs produce events and artifacts.
- GUI Snapshot derives operator views.

This borrows AgentScope Java's durable workspace discipline while preserving AHO's external-executor model.

## 6. Runtime Flow

```text
Change facts
-> Context Projection
-> Runtime Adapter
-> Run events / artifacts
-> Validation / Audit
-> Derived approvals
-> Human action
-> Canonical state transition
```

Streaming output belongs to the Run or AgentSession. Ordinary user conversation belongs to the DemandConversation / Topic interaction log. Skill enablement belongs to the Workbench store. Workpad summarizes the current internal Change. Long-term project meaning belongs to the Change and Memory Store.

## 7. Snapshot Requirements

A future Workbench Snapshot should be able to derive, without adding a new authority:

- topic list and status;
- Workpad intake state, clarification requests, and current understanding;
- thread event feed;
- current agent runs and run summaries;
- per-project approval inbox;
- active worktrees;
- validation, audit, drift, and evolution summaries.

If a GUI field cannot be derived from existing facts, that is a signal to add or revise a canonical object deliberately, not to hide state inside the frontend.

## 8. Scheduler User Surface

Phase 10A keeps the scheduler runtime model evidence-driven while simplifying the ordinary user surface. Workbench may present user-facing scheduler stage labels, but those labels are projections over existing scoped scheduler actions. They do not become a scheduler loop, a slot allocator, source mutation authority, or execution authorization. Every high-impact scheduler transition must continue to re-read scoped evidence, pass stale-target checks, preserve decision/audit ids, and rely on ToolPolicyGate plus human confirmation before moving one legal step.

Phase 10B defines the Goal-driven Adaptive Loop as main-agent runtime policy, not as a new runtime object. The loop may keep a persistent objective in conversation/Change context and use current evidence to decide the next legal action, but it does not itself create TaskRuns, WorkerLeases, worktrees, runs, SchedulerRun state, child Changes, or source mutations. Low-conflict independent slices may be proposed for parallel workers only after scheduler evidence proves their scope; high-conflict or dependent slices must stay sequential, wait for predecessor evidence, or enter rework / IntegrationFix. Completion must be audited against the original objective and current artifacts, not inferred from model confidence.

Multi-worktree scheduler execution remains auxiliary runtime evidence. Worktrees isolate development but do not guarantee that outputs can be combined. Final merge safety must still be proven by SchedulerIntegrationCandidate, existing IntegrationCheck, aggregate validation/audit, and human apply gate. ToolPolicyGate and human gates remain authority for high-impact actions even when the model has broad local tool permissions.

Phase 10C materializes that policy as `GoalLoopDecision` evidence. Evaluating the loop writes a versioned JSON/Markdown artifact and a Workbench decision, but it must always set `executionStarted=false`. It may recommend only an existing scoped action when all required target ids are present. If evidence is incomplete, conflicting, or already has an active worker path, the decision must wait or block rather than inventing a new execution transition. The artifact helps the main Agent explain the next step; it does not create scheduler runtime state, TaskRuns, WorkerLeases, WorkerSessions, worktrees, runs, child Changes, IntegrationCheck records, apply records, or close records.

Phase 10D keeps the runtime boundary unchanged. Its Workbench confirmation item only invokes the existing `planning.goal-loop.evaluate` action through the normal high-impact workflow-action path. It is suppressed when a more specific current confirmation exists, and it must not call scheduler/runtime/start/apply/close handlers directly.

Phase 10E keeps that runtime boundary unchanged while adding iteration evidence. `GoalLoopIteration` is a journal record for one explicit observe/reason pass: it records the previous iteration/decision ids, the current decision id, continuation verdict, conflict/completion snapshots, and `executionStarted=false`. It must not allocate runtime state, start workers, run validation/audit/IntegrationCheck, mutate source, or mark the Change complete.

Phase 10F keeps the same non-execution boundary. The continuation-state fields inside `GoalLoopIteration` are evidence-only runtime constraints, not a runtime controller. They may record conservative budget/accounting signals as `unknown` or declared evidence, but they must not start continuation turns, reserve worker slots, run scheduler actions, mutate source, or authorize close.

Phase 10G keeps the boundary unchanged while adding continuation brief evidence. `GoalLoopContinuationBrief` may describe how the next main Agent turn should re-read evidence and continue the long-running Goal/Change, but it must not enqueue a turn, call a scheduler/runtime action, execute the recommended action, mutate source, close a Change, or infer Codex-style continuation locks or token accounting. Any concrete transition named by the brief still has to be revalidated and confirmed through its own scoped Harness action.
