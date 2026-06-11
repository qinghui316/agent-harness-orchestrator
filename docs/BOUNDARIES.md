# Boundary Decisions

Agent Harness Orchestrator is a local-first Agent Development OS with a Spec-Anchored Harness Kernel.

This document records boundaries that are expensive to change later. It is not a roadmap, implementation plan, or feature checklist.

## 1. Product North Star

AHO is not a generic multi-agent framework, ticket board, or pure chat UI. It is a project-linked demand conversation, memory, and execution harness that keeps human intent, specs, tasks, code, validation, review, and Harness evolution connected.

Multi-agent orchestration is a core execution layer for the final product. It is not the source of truth. Agents may run in parallel or sequence, but accepted Change artifacts, evidence, and human gates decide workflow state.

The long-term product chain is:

```text
Spec -> Acceptance Criteria -> Plan -> Tasks -> Context Projection
-> Disposable Agent Run -> Events / Artifacts -> Validation / Review
-> Archive -> Evolution Evidence
```

The final Workbench-facing product chain is:

```text
Natural-language request -> Demand Conversation -> Intake / Project Scan
-> Planning artifacts -> User confirm execution -> Agent Orchestration
-> Evidence -> Result -> User apply / merge decision -> Archive
```

The product should make AI coding controllable, reviewable, and recoverable. Faster code generation is useful only when it stays anchored to durable project memory and human-confirmed decisions.

## 2. Personal-First and Local-First Boundary

The primary user is an individual developer managing local repositories with tools such as Codex CLI, Claude Code, and shell commands.

Decisions:

- Project files, AHO-managed memory, run artifacts, and evidence are local-first.
- Projects must explicitly opt in before AHO writes to them.
- Team permissions, cloud sync, remote workers, and shared hosted state are deferred.
- Local workflows should not require a server, database daemon, or cloud account.
- Future team mode must build on the same memory interfaces instead of replacing them.

## 3. Spec-Anchored Boundary

The near-term target is L2 Spec-Anchored development, not immediate L3 Spec-as-Source development.

Definitions:

- L1 Spec-First: write specs before implementation, but specs may drift.
- L2 Spec-Anchored: keep specs, acceptance criteria, tests, code, and validation continuously linked.
- L3 Spec-as-Source: humans edit specs and code is generated or maintained from specs.

Decisions:

- Change is the workflow unit.
- Spec is the semantic anchor.
- Acceptance Criteria are the validation anchors.
- Run is an execution attempt.
- Artifact is auditable evidence.
- L2 is the practical product target for upcoming phases.
- L3 is a future experiment and must not be implied by current UX or docs.

## 4. Project Memory Boundary

Project memory must live in durable AHO-managed stores, not in agent chat, hidden model state, or a single runtime session.

AHO has three memory modes:

| Mode | Source of truth | Boundary |
| --- | --- | --- |
| `repo-local` | Target repository files | Current implementation and compatibility mode |
| `external-local` | AHO home on the user's machine | Personal default target |
| `remote` | Remote memory service | Future team/cross-device authoritative source |

`repo-local` is retained for compatibility, migration, portable exports, and projects that intentionally want Harness history in Git. It is not the long-term default for personal multi-project use.

`external-local` is the target personal default. The project keeps a marker and a memory map, while durable memory lives outside the business repository under AHO home.

`remote` is future team mode. In remote mode the remote service is authoritative and the local store is a cache.

Current repo-local memory locations:

```text
AGENTS.md                 routing map
docs/                     durable product, architecture, and boundary knowledge
harness/changes/          specs, plans, tasks, reviews, archive history
.agent-harness/runs/      events, logs, diffs, validation reports, run artifacts
harness/evolution/        evidence, proposals, results, controlled evolution state
```

Decisions:

- `AGENTS.md` is a map, not a memory database.
- `docs/` and Harness artifacts preserve durable project knowledge in the active memory store.
- `context.md` is a per-run projection and is not source of truth.
- Chat transcripts can inform work, but they are not durable project state unless summarized into files.
- Future dashboards and indexes must derive from AHO-managed memory rather than replacing it.
- External-local and remote memory must be accessed through Memory Resolver / Memory Store boundaries, not through hardcoded repo-local paths.

## 5. AGENTS.md Routing Boundary

`AGENTS.md` is the first routing document for agents entering a project.

Its job is to tell an agent where to read:

- product facts
- architecture decisions
- ECL rules
- current active change
- pending evolution
- validation commands
- task-specific docs

Decisions:

- `AGENTS.md` should stay compact and navigational.
- `AGENTS.md` should identify the memory mode and marker location.
- `AGENTS.md` should describe how to resolve durable memory, without embedding private paths or secrets.
- Detailed rules belong in `docs/` or Harness files.
- AHO may generate `context.md` for a specific run so Codex-style tools receive the necessary context even if they do not automatically follow the full routing chain.
- If durable memory is unavailable, `AGENTS.md` should instruct agents not to infer hidden history and to ask for memory attach, sync, init, or repair.

## 6. Memory / Execution Separation Boundary

AHO treats Codex-style agents as disposable executors. It does not assert that Codex, Claude Code, or another tool is internally stateless.

Decisions:

- AHO must not depend on agent-internal memory, hidden sessions, or internal tool traces.
- Each run rebuilds context from Harness memory and writes results back as artifacts.
- Agent outputs are proposals until validated, reviewed, and confirmed by a human.
- Agents communicate through files, events, diffs, validation reports, and review artifacts, not through shared chat context.
- If a runtime exposes richer session APIs later, those APIs are adapters, not the source of project truth.

## 6A. Codex Skill Bridge Boundary

AHO may use Codex plugin and skill discovery as a runtime delivery mechanism, but AHO skill memory remains authoritative.

Decisions:

- `skills/{skill-id}/SKILL.md` under the resolved memory root is the skill source of truth.
- SQLite records skill enablement and bridge sync state.
- `~/.codex/plugins/aho-managed` is a rebuildable runtime projection.
- AHO must not overwrite user Codex skills, oh-my-codex skills, or global Codex configuration.
- Bridge install/sync is explicit; runs may warn when the bridge is out of sync but must not secretly write to `~/.codex`.
- Imported skills do not execute scripts in Phase 5E.
- Runs record enabled skill ids and hashes so Codex behavior can be audited later.

## 6B. ECL Agent Runtime Boundary

ECL is the workflow protocol and canonical project record. It is not a single mega-prompt and must not be reduced to a Codex skill.

Phase 5F introduces an AHO-owned agent runtime bridge:

- AHO selects `agent_role`.
- AHO reads `agents/{role-id}.md` from memory or bundled profiles.
- AHO validates role write capability and required gates.
- AHO sends role instructions, bounded ECL context, and the user/task prompt to Codex.
- Codex executes the scoped run and emits artifacts.

Skills remain discoverable runtime capabilities. AHO must not inject all enabled skill bodies into every prompt. Enabled skills are recorded as available provenance; actual skill usage is only recorded when observable evidence exists.

Phase 8C keeps this execution boundary unchanged while splitting `src/code/manager.ts` into owned code execution modules. Code execution gate checks, run session setup, context packet writing, live events, Codex app-server execution, Codex exec streaming, artifact summarization, and status helpers remain implementation boundaries under the code domain. The app-server branch must preserve the resolved role id in session and active-turn metadata; a rework-coder run must not be labeled as a coder-agent run. This is metadata correctness, not a new execution capability.

Phase 8D applies the same ownership rule to integration checks. Integration-check target collection, patch workspace setup, aggregate validation, aggregate audit, IntegrationFix attempts, repository access, and apply/discard safety belong in owned integration-check modules behind the `src/integration-check/manager.ts` facade. Explicit `worktreeIds` are scoped targets: if any requested id is missing, stale, applied, discarded, preview-failed, or not ready, the integration check must fail closed instead of silently running on the remaining targets. Integration checks remain source-root apply preparation evidence, not automatic merge truth.

Phase 8E applied the ownership rule to remote handoff and PR landing. PR review, PR feedback, remote landing, and post-merge managers remain compatibility facades; schemas, artifact repositories, provider/GitHub CLI adapters, readiness checks, handoff/attempt/result records, rendering, and post-decision side effects belong in owned modules. Remote review, merge, local sync, and remote branch cleanup remain evidence-backed, human-gated transitions.

Phase 8F applies the ownership rule to source-root apply, local landing packages, Draft PR handoff, and landing queues. Apply readiness/gate, source diff attribution, Draft PR provider/source-match checks, and landing queue candidate/result orchestration belong in owned modules behind compatibility facades. Landing scoped action targets must match the execution layer, Draft PR creation must reject stale confirmation targets, and the refactor must not add unattended merge, reviewer assignment, new route/action/CLI behavior, source-root rewrite bypasses, or broader maintenance side effects.

Phase 8G applies the ownership rule to Spec-Test evidence. Workbench selected-demand status, drift, proposal, and generation must resolve the selected `changeId` instead of using project-global exactly-one-active fallback. CLI spec-test commands keep legacy single-active behavior and fail closed when multiple active Changes exist. Spec-Test proposal accept remains an evidence mapping transition only; it must not run tests, mutate source root, or bypass validation, audit, apply, or human gates.

Phase 8H applies the ownership rule to TaskQueue runtime coordination. New TaskQueue starts must carry and validate the same full typed scope used by the Workbench confirmation contract: `taskQueueProposalId`, `workflowGraphPlanId`, `readinessManifestId`, `decompositionPlanId`, and `workflowRunId`. Paused resume must carry matching `workflowRunId`, `queueRunId`, proposal, graph, readiness, and decomposition ids. Low-level queue helpers must not silently fall back from proposal/graph to mutable latest readiness/decomposition state, and TaskQueue internals belong in owned modules behind the `src/task-queue/manager.ts` facade.

Phase 8I applies the ownership rule to DemandWorker coordination. DemandWorker remains bounded local demand execution coordination evidence, not workflow truth and not a new scheduler. Schema/type definitions, artifact paths, repository reads/writes, main-orchestrator decisions, queue projection, slot policy, claim service, lifecycle transitions, and reconcile helpers belong in owned `src/demand-worker/*` modules behind the `src/demand-worker/manager.ts` facade. DemandWorker modules must not depend on Workbench, server routes, web UI, CLI command modules, or the facade they sit behind.

Phase 8J applies the ownership rule to TaskRun / WorkerLease coordination. TaskRun and WorkerLease remain execution coordination evidence, not workflow truth. Reconcile must match coder Run evidence by both `taskRunId` and the owning Change, workflow-result completion must not bind cross-Change code run or worktree links, and schemas/types, paths/artifacts, repository, lease service, start/retry, reconcile, workflow-result, and guard helpers belong in owned `src/task-run/*` modules behind the `src/task-run/manager.ts` facade. TaskRun modules must not depend on Workbench, server routes, web UI, CLI command modules, or the facade they sit behind.

Phase 8K applies the ownership rule to typed workflow artifacts. DecompositionPlan, DecompositionReadinessManifest, TaskQueueProposal, and WorkflowGraphPlan artifacts must prove their `changeId` matches the owning `changePath/change.json` before artifact reads, writes, builders, or graph compile can proceed. Cross-Change, misplaced, or forged artifacts fail closed and must not enter execution or UI projections. Schemas/types, paths/ref resolving, hashing, guards, artifact repositories, graph compile, and Markdown rendering belong in owned `src/workflow-artifacts/*` modules behind the `src/workflow-artifacts/manager.ts` facade. Workflow artifact modules must not depend on Workbench, server routes, web UI, CLI command modules, or the facade they sit behind.

Phase 8L applies the ownership rule to WorkflowRun recovery evidence. `WorkflowRun` read paths must prove persisted `run.changeId` matches the requested Change; list/projection paths must skip misplaced runs; event reads must prove each journal row matches both `changeId` and `workflowRunId`; event append must derive canonical scope from the WorkflowRun itself; and queue lifecycle sync must reject cross-Change or cross-queue binding. WorkflowRun internals belong in owned `src/workflow-run/*` modules behind the `src/workflow-run/manager.ts` facade. WorkflowRun modules must not depend on Workbench, server routes, web UI, CLI command modules, or the facade they sit behind.

Phase 8M applies the same rule to Change lifecycle metadata. Active and parking Change directories must agree with `change.json.id` and metadata state before status, close/abandon, Workbench projection, or thread-log import can trust the metadata. Archived metadata must remain archived and match its archive path when that path is recorded. Change lifecycle internals belong in owned `src/change/*` modules behind the `src/change/manager.ts` facade, while Change/ECL remains workflow truth.

Phase 8N applies the same ownership rule to Run evidence. Run schemas/types,
artifact path helpers, repository reads/lists, event append, run id generation,
context projection, local command execution, and small guards belong in owned
`src/run/*` modules behind the `src/run/manager.ts` facade. Run, Validation,
and Audit remain evidence records; they do not replace Change/ECL, accepted
artifacts, apply/close decisions, or human gates.

Phase 8O applies the same ownership rule to Worktree metadata. Worktree metadata must prove filename `worktreeId`, JSON `worktreeId`, `projectId`, and checkout root scope before status, projection, apply, remove, or mark-applied paths can trust it. List/projection paths skip invalid metadata; direct read/update/delete paths fail closed. Worktree internals belong in owned `src/worktree/*` modules behind the `src/worktree/manager.ts` facade, and those modules must not depend on Workbench, server routes, web UI, CLI command modules, or the facade they sit behind.

Phase 8P applies the same ownership rule to Validation and Audit evidence. Validation and Audit records must prove directory id, artifact id, run id, and requested Change scope before direct read, accept, close gate, apply gate, spec-test, task reconcile, queue reconcile, or workflow stage resume paths can trust them. List/projection paths skip malformed, forged, misplaced, or cross-Change evidence; direct read/show/accept paths fail closed. Validation and Audit internals belong in owned `src/validation/*` and `src/audit/*` modules behind their manager facades, and those modules must not depend on Workbench, server routes, web UI, CLI command modules, or the facade they sit behind.

Phase 8Q applies the same ownership rule to residual Workbench action handlers. `src/workbench/chat.ts` is the conversation/action facade and must not own the main action handler map or landing, PR, remote handoff, post-merge, landing queue, or conversation-control helper implementations. Those handlers belong in owned `src/workbench/actions/handlers/*` modules, and those modules must not depend on `chat.ts`, server routes, web UI, CLI command modules, or Workbench projection facades. This is a module boundary only; action ids, payloads, decision/audit scope, stale-target revalidation, ToolPolicyGate behavior, SSE/live events, thread logs, and projections remain unchanged.

Phase 8R turns the repeated ownership rule into a long-term Future Feature Module Boundary Rule. Future product features must extend owned modules first and must declare the owner module before implementation. Broad compatibility facades and shells remain valid for public exports, thin composition, dependency-injection wiring, route/action dispatch glue, and backwards-compatible entrypoints, but they must not regain main implementation ownership by default. The default non-owner locations for new main implementation logic are `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/workbench/projections/read-model.ts`, `src/server/workbench-server.ts`, `src/web/src/App.tsx`, `src/workflow-runtime/code-workflow.ts`, `src/cli/program.ts`, `src/types/index.ts`, and domain `manager.ts` facades. If a future change must temporarily put main logic in one of those files, its `plan.md` and `reviews/review.md` must record the reason, risk, compatibility surface, boundary tests, and follow-up split candidate. File size alone remains a review signal, not a failure condition.

Phase 8S makes `src/workflow-scheduler/` the owner for scheduler-readiness contracts. `SchedulerContract` is non-executing evidence for parallel TaskGraph readiness; it must not be treated as workflow truth, a sequential `WorkflowGraphPlan`, a TaskQueue start input, or an executable ODWF script. SchedulerContract compile may write typed artifacts and decision/audit evidence only. It must not create WorkflowRun, TaskQueueRun, TaskRun, WorkerLease, AgentTask, worktree, run, child Change, source mutations, or cache/replay records.

Phase 8T adds AgentScope 2.0 and AgentScope Java Harness to the reference system and names the future Runtime Continuity Layer. The next product-code work after SchedulerContract must not jump straight to a parallel executor. It should first define WorkerSession / AgentSession ownership, RuntimeWorkspace / sandbox boundaries, AgentEventEnvelope / EventSource replay, permission / external-execution records, and recovery semantics. These contracts are runtime auxiliaries. They must not replace Change/ECL, accepted Spec/Plan/Tasks/AC, Run, Validation, Audit, Apply/Close human gates, or Harness evolution, and reference code must not be vendor-copied into AHO product code.

Phase 8U defines the first Runtime Continuity Layer contract for code runs, and Phase 8V extends it to validation and audit role workers. `WorkerSession`, `RuntimeWorkspace`, `EventSource`, and `AgentEventEnvelope` artifacts are additive evidence beside the Run; they do not change `run.json`, raw Codex logs, validation/audit artifacts, Workbench projections, action payloads, or workflow truth. Canonical event scope must come from `WorkerSession`, not from raw adapter events. Direct read/append paths fail closed on cross-Change, cross-Run, cross-role, or misplaced evidence; list/projection-style helpers skip malformed evidence. This layer must not be used as a shortcut to parallel execution, child Changes, sandbox backends, permission engines, or Validation/Audit authority changes.

Phase 8W extends the Runtime Continuity event contract with permission and external-execution evidence rows in the existing `agent-events.jsonl` journal. `permission.profile.attached`, `permission.decision.recorded`, and `external-execution.requested/completed/failed` describe the role permission snapshot, existing ToolPolicy outcome, and adapter/process lifecycle for code, validation, and audit workers. They must not create a new permission authority, bypass ToolPolicyGate, prompt for HITL permission, alter Codex approval mode, change public artifacts, or create scheduler/runtime objects. Canonical scope must still come from `WorkerSession`; raw payload scope fields are ignored for the envelope.

Phase 8Y makes `src/workflow-scheduler/` the owner for Scheduler Dispatch / Reconcile dry-run evidence. `SchedulerDispatchDryRun` is a non-executing projection over a scoped SchedulerContract: it may write versioned/latest dry-run artifacts and decision/audit evidence, but it must not allocate DemandWorker slots, create WorkerLeases, create TaskRuns, create WorkflowRuns, create AgentTasks, create worktrees, create runs, create child Changes, mutate source, introduce scheduler runtime state, or authorize parallel execution. Workbench, server, and frontend code may call/display the dry-run, but must not own the scheduling logic.

Phase 8Z keeps `src/workflow-scheduler/` as owner for Scheduler Worker Session Plan / Recovery Contract evidence. `SchedulerWorkerSessionPlan` is a non-executing plan over a scoped dry-run and contract: it may write versioned/latest worker-plan artifacts and decision/audit evidence, but it must not create `WorkerSession`, `RuntimeWorkspace`, `EventSource`, `WorkflowRun`, `TaskQueueRun`, `TaskRun`, `WorkerLease`, `AgentTask`, worktree, run, child Change, scheduler runtime state, or parallel execution authorization. Workbench, server, and frontend code may call/display the worker plan, but must not own worker-session planning logic.

Phase 9A keeps `src/workflow-scheduler/` as owner for Scheduler Claim / Reconcile Plan evidence. `SchedulerClaimReconcilePlan` is a non-executing coordination plan over a scoped worker-session plan, dry-run, and contract: it may write versioned/latest claim/reconcile artifacts and decision/audit evidence, but it must not create `WorkerLease`, `WorkerSession`, `RuntimeWorkspace`, `EventSource`, `WorkflowRun`, `TaskQueueRun`, `TaskRun`, `AgentTask`, worktree, run, child Change, scheduler loop, slot allocator state, or parallel execution authorization. It must use `claimIntentId` and `plannedWorkerKey` rather than real lease/session ids. Workbench, server, and frontend code may call/display the claim/reconcile plan, but must not own claim/reconcile planning logic.

Phase 9B keeps `src/workflow-scheduler/` as owner for Scheduler Launch Preflight evidence. `SchedulerLaunchPreflight` is a non-executing launch-readiness contract over a scoped claim/reconcile plan, worker-session plan, dry-run, and contract: it may write versioned/latest launch-preflight artifacts and decision/audit evidence, but it must not pre-authorize ToolPolicy, bypass human gates, create runtime-continuity sidecars, or create any scheduler/runtime execution records. Workbench, server, and frontend code may call/display launch preflight evidence, but must not own launch-preflight planning logic.

Phase 9C keeps `src/workflow-scheduler/` as owner for SchedulerRun journal shell evidence. `SchedulerRun` is a non-executing human-gated launch-intent and recovery/journal record over a scoped checked launch preflight: it may write versioned/latest SchedulerRun artifacts, a SchedulerRun journal, and decision/audit evidence, but it must not create WorkflowRun, TaskQueueRun, TaskRun, WorkerLease, AgentTask, WorkerSession, RuntimeWorkspace, EventSource, worktree, run, child Change, scheduler loop, slot allocator state, or parallel executor records. Workbench, server, and frontend code may call/display SchedulerRun evidence, but must not own SchedulerRun preparation logic or expose parallel execution controls.

Phase 9D introduces `src/scheduler-runtime/` as owner for SchedulerRun-scoped runtime shell sidecars. `SchedulerRuntimeState`, `SchedulerRuntimeEvent`, and `SchedulerReconcileSnapshot` may record initialization, reconcile checkpoints, blocked/warning claim intent state, and runtime-shell summaries under the existing SchedulerRun identity. They must not alter the SchedulerRun JSON shape, create a second scheduler run identity, allocate WorkerLeases, create WorkerSessions/RuntimeWorkspaces/EventSources, create WorkflowRun/TaskQueueRun/TaskRun/AgentTask/worktree/run/child Change records, start scheduler loops, allocate slots, call coder/validator/auditor, or pre-authorize ToolPolicy/human gates. Workbench/server/frontend code may dispatch and display these sidecars, but must not own scheduler runtime logic.

Phase 9E extends `src/scheduler-runtime/` with `SchedulerRuntimeClaimReservation`. It may reserve claim-intent evidence for one reconcile snapshot, record source-lock reservation summaries, and mark a newer snapshot reservation as superseding an older one. It must not create or reuse real WorkerLease ids, WorkerSession ids, TaskRun ids, worktrees, runs, slots, or scheduler loops. Duplicate reservation for the same reconcile snapshot must fail closed; a newer reconcile snapshot may produce a new reservation with explicit supersession evidence.

Phase 9F adds `planning.scheduler.plan.prepare` as the user-facing Workbench scheduler plan preparation / launch-confirmation surface. The action may orchestrate existing owned scheduler modules to generate or re-read SchedulerContract, DispatchDryRun, WorkerSessionPlan, ClaimReconcilePlan, LaunchPreflight, SchedulerRun, SchedulerRuntimeState, ReconcileSnapshot, and ClaimReservation evidence, then produce a plain-language launch brief. It must not put the main implementation back into Workbench/server/frontend broad facades, must not bypass existing scoped guards or stale-target revalidation, and must preserve full generated ids in action payload, decision, and audit scope. The right confirmation queue is a Harness stage gate rather than a generic permission prompt: ordinary users confirm `准备并行执行计划` and then `确认启动这个并行执行计划`, not each internal scheduler checkpoint. Phase 9F still must not start workers, allocate leases or slots, create TaskRuns, WorkerSessions, RuntimeWorkspaces, EventSources, worktrees, runs, child Changes, scheduler loops, or parallel executor records.

Phase 9G adds `planning.scheduler.worker.start-first` as a single-worker scheduler start gate. `src/scheduler-runtime/` owns the worker-start selection, lineage guard, evidence, and runtime event append. Workbench/server/frontend code may only dispatch the action and display summaries. The action must start at most one coder-stage worker from the latest claim reservation, must use a scheduler-specific code execution gate, and must preserve full SchedulerRun / ClaimReservation / reservation intent / TaskRun / WorkerLease / worktree / run scope in decision and audit payloads. It must not reuse the sequential TaskQueue full Coder -> Validation -> Audit helper, must not start validation/audit/rework, and must not introduce whole-wave dispatch, a scheduler loop, a slot allocator, child Changes, or full parallel executor behavior.

## 7. Memory Unavailable Boundary

Memory can be unavailable on a new machine, after a plain repository clone, when AHO home was not synced, when permissions are missing, or when a future remote memory service is offline.

Decisions:

- A marker without resolvable durable memory is an incomplete project context.
- Agents must not invent active changes, archive history, or prior decisions.
- Agents may read public repository docs and source for low-risk analysis.
- High-impact work should pause until memory is attached, synced, initialized, or repaired.
- Missing memory is a product state to surface, not a reason to silently fall back to chat history.

## 8. Human Confirmation Boundary

Every high-impact agent output requires human confirmation before it changes the next critical state.

Confirmation gates:

- Spec Agent output requires human confirmation before planning depends on it.
- Planner Agent output requires human confirmation before coding starts.
- Coder diff requires validation, audit, and human confirmation before apply or merge.
- Validator failure blocks close by default.
- Auditor approval is not merge authority.
- Close/archive requires human confirmation.
- Harness evolution proposals require human confirmation before applying.

Decisions:

- Agent output is a proposal, not a command.
- AHO can automate preparation, execution, validation, and evidence collection.
- Humans retain final decision authority at spec, plan, apply/merge, close, and evolution gates.

## 9. Demand Conversation / Change / Run / Artifact Boundary

Demand Conversation is the user-visible unit of work. A Change is the internal workflow and evidence object bound to that conversation. A Run is one execution attempt against a Change.

Relationship:

```text
Project -> Demand Conversation -> internal Change / Workpad -> Run -> Events / Artifacts
```

Decisions:

- Users should see projects and demand conversations, not internal Topic/Change/Workpad terminology.
- One demand conversation binds to one internal Change/Workpad for the lifetime of that demand.
- After a demand conversation is archived, implementation-class follow-up input creates a linked follow-up conversation rather than rebinding the old conversation to a new Change.
- A Change may have multiple runs.
- A failed run must not erase change history.
- Artifacts should be durable enough for review, resume, dashboard display, and evolution evidence.
- Run artifacts should include context projection, events, logs, diffs, validation results, and review outputs where available.
- Archive history is evidence for future Harness evolution.

## 10. Workbench Boundary

The personal GUI is conversation-first. The left sidebar groups demand conversations under project folders. The center is the main planning/execution conversation. The right inspector shows the current demand's result, evidence, and high-impact decisions. Internal Workpad and Topic records may still exist as read-model/API compatibility layers, but they are not primary user concepts.

Decisions:

- One demand conversation maps to one internal Change/Workpad.
- A new independent demand creates a new conversation and new Change.
- The main conversation handles clarification, planning drafts, execution confirmation, run results, result review, and user feedback.
- Workpad is an internal control-surface/read-model term. It does not replace `spec.md`, `plan.md`, `tasks.md`, `ac-map.json`, run artifacts, validation, audit, apply, or close records.
- Topic is an internal/historical/API compatibility term and should not be the primary user-facing label.
- Thread View is a narrative projection over demand conversation records, Change facts, Runs, and decisions.
- Agent Loop View exposes run-level streaming, tool/event detail, future replay, and future interrupt/cancel controls.
- A cancelled or interrupted Run does not close the owning Change.
- GUI snapshots are derived views and must not become a second workflow database.

## 10A. TaskGraph / Agent Orchestration Boundary

Future multi-agent execution is driven by TaskGraph, not by unbounded agent group chat.

Decisions:

- TaskGraph comes from accepted Plan/Tasks and may be materialized as a generated artifact, but it must remain linked to canonical ECL files.
- Each task needs stable id, title, role, dependencies, status, assigned run, evidence, and gate.
- Agent runs must bind to `projectId + changeId + taskId + roleId + runId + workspace/session`.
- Worker leases, retry queues, blocked states, and app-server sessions are runtime state. They must reconcile back to Change/TaskGraph facts.
- Agents hand off through artifacts, diffs, validation, audit, and Workpad summaries, not hidden shared memory.
- External queues such as Linear may be future adapters, but cannot be required for the local-first product.

## 10B. Agent Visualization Boundary

Future agent animation or activity maps are presentation, not workflow truth.

Decisions:

- Agent animation derives from TaskRun, WorkerLease, AgentSession, run events, and evidence.
- The visual state can show reading, coding, validating, auditing, waiting, blocked, retrying, or completed.
- Clicking the visual state should lead to evidence and raw logs.
- The animation must not be the only place where state exists.
- The UI must not imply an agent completed work unless canonical evidence and gates support that state.

## 11. Thread / Run Boundary

Demand Conversation, internal Topic/Thread records, Run, and Session are different objects.

Decisions:

- Demand Conversation is the user-facing interaction surface for one demand. Internally it binds to Topic/Change/Workpad records and is persisted for continuity, but it is not the accepted specification.
- Thread View is the user-facing narrative projection over conversation records, accepted Change facts, Runs, artifacts, and decisions.
- Run is the executable attempt with live events, stream output, artifacts, and future interrupt/cancel controls.
- Codex Session IDs may exist as runtime helpers for ordinary chat continuity, but they must not replace Change as the workflow unit or the durable memory store as source of truth.
- Interrupting, cancelling, or replaying a Run changes run state only; it does not accept a proposal, close a Change, or rewrite canonical ECL files by itself.
- Thread View must remain rebuildable from durable facts and must not become an independent source of truth.

## 12. Decision Inspector Boundary

The Decision Inspector is a selected-demand actionable view, not a new source of truth.

It may surface:

- planning proposals ready for execution confirmation;
- role/result cards and evidence;
- worktrees ready to apply or merge;
- demand conversations ready to finish or abandon;
- Harness evolution proposals awaiting approval.

Accepting a decision updates the underlying canonical object. The inspector itself must be rebuildable from canonical state.

Pending decisions must show what the user is accepting, including proposal/run/worktree/artifact evidence. Accepted and completed decisions may stay visible as interaction history, but they do not become workflow truth. A request-changes decision records user feedback and suggests a follow-up proposal/run; it must not directly rewrite canonical files.

Accepted, consumed, applied, discarded, or closed items must leave the pending queue. De-duplication must be backed by canonical artifacts, accepted events, or action records that point back to canonical evidence.

## 13. Worktree vs Container Boundary

Worktree isolation is the default direction for local code-change isolation.

Worktrees provide:

- independent file trees
- independent diffs
- reduced pollution of the main working tree
- easier review and discard
- possible parallel runs

Worktrees do not provide:

- process isolation
- network isolation
- environment-variable isolation
- credential isolation
- dependency sandboxing
- OS-level security boundaries

Decisions:

- Worktree is a code-change isolation layer, not a complete security sandbox.
- Phase 2/3 should converge toward worktree execution for coding and Harness evolution.
- Direct execution may exist only as an explicit local convenience mode.
- Container sandboxing is a future optional layer for higher-risk, team, or remote execution scenarios.
- Automatic merge is out of scope until explicitly added behind human approval gates.

## 14. Codex-Style Executor Boundary

Codex CLI, Claude Code, and similar tools are external runtimes.

What AHO can reasonably do:

- generate a context projection
- choose the working directory or worktree
- invoke a process
- capture stdout and stderr
- record start and end state
- collect git diff
- run validation commands
- ask another agent or human to review outputs

What AHO must not rely on:

- hidden runtime memory
- exact internal reasoning
- exact internal tool-call sequence
- runtime-specific session continuity
- complete isolation from local files unless an actual sandbox exists

Fallback strategy:

- Use `context.md` instead of runtime memory.
- Use events, logs, diffs, validation, and review artifacts instead of internal traces.
- Use worktrees and explicit cwd boundaries instead of assuming sandbox safety.
- Use human confirmation gates for high-impact decisions.

Write-mode Coder boundary:

- `aho run codex` remains read-only proposal capture.
- `aho code run` is a write-capable command only after the Harness typed readiness gate authorizes direct single-change code execution.
- Workbench `code.run`, CLI `aho code run`, and lower-level code-run helpers must share the same DecompositionReadinessManifest gate; direct code execution is rejected when readiness is missing, stale, forged, blocked, or points to a sequential TaskQueueProposal path.
- TaskQueue-internal coder/rework execution is not direct `code.run`; it must carry a matching `WorkflowGraphPlan`, TaskQueueProposal snapshot, readiness snapshot, queue item, and `taskRunId`. Cross-queue, stale graph, missing graph, or mutable latest-file fallback is rejected before write mode.
- Phase 7M requires TaskQueue resume and TaskQueue start confirmation to preserve full typed scope from Workbench projection through UI payload, server stale-target revalidation, ToolPolicyGate audit, and low-level runtime validation. Phase 8H makes the low-level new-start path match that contract: missing or explicitly mismatched proposal, graph, readiness, decomposition, workflow, or queue ids fail closed.
- Phase 7N established the first Workbench/runtime module ownership boundaries. Phase 7O extended that requirement to Workbench server route/live/projection helpers, projection builder groups, frontend DTO/types/panels/helpers, and selected chat action/live-transcript helpers. Phase 7P split Workbench action execution and runtime-kernel glue out of `chat.ts`. Phase 7Q moved Workbench read-model DTOs and the first UI panel boundaries. Phase 7R extended the same boundary to the remaining `read-model.ts` projection-builder implementation. Phase 7S extended it to Workbench chat: action handlers, planning helpers, Codex chat bridge, topic runtime helpers, decision persistence, and demand-worker helpers belong in owned modules, while `chat.ts`, `workbench-server.ts`, `manager.ts`, `read-model.ts`, and `App.tsx` remain compatibility facades/orchestrators rather than default locations for new workflow branches. Phase 7T extended this to the frontend surface: app shell, panels, transcript/rendering helpers, scoped payload helpers, and CSS organization must have owned modules without changing Workbench behavior. Phase 7U extended the same rule to the workflow runtime kernel: TaskRun sequence, TaskQueue runner, stage resume, role stage execution, bounded rework, live event forwarding, and runtime guard helpers belong in owned runtime modules, while `code-workflow.ts` remains a compatibility facade. Phase 7V extended the rule to residual read-model and confirmation queue builders: snapshot/topic/workpad/approval/helper builders and typed workflow / integration / landing / PR / remote / post-merge confirmation domains belong in owned modules, while confirmation items must keep public shape and preserve full typed ids on actions. Phase 7W extended the rule to the Workbench server adapter: route dispatch, request guards, response helpers, project admin, direct-project routes, registered-project routes, topic live/replay, normal/live action endpoints, approval allowlist execution, stale-target revalidation, static serving, and native dialog helpers belong in owned server modules, while `workbench-server.ts` remains a compatibility facade. Phase 7X extended the same rule to residual Workbench read-model builders: snapshot shell, workpad, task graph/task queue, result review, decision inspector, evidence/background/memory isolation, and lazy typed-workflow projection adapters belong in owned read-model modules, while `implementation.ts` remains the compatibility aggregator for public read-model entrypoints. Phase 7Y extended the rule to residual frontend Workbench surfaces: shell sidebar/thread/assistant/live helpers and Workpad planning/typed-workflow/task/evidence/action button surfaces belong in owned frontend modules, while `WorkbenchShellParts.tsx` and `WorkpadPanel.tsx` remain compatibility facades for existing imports. Phase 7Z extended the rule to CLI and type ownership: command groups belong in owned `src/cli/commands/*` modules registered through one shared `CliContext`, `src/cli/program.ts` remains the composition facade, domain types belong in owned `src/types/*` modules, and `src/types/index.ts` remains the compatibility re-export barrel. Phase 8A extended the rule to AgentTask / maintenance domain ownership behind the `src/agent-task/manager.ts` facade. Phase 8B extends the rule to Change Proposal ownership: proposal schemas, paths/hashes, repository, parser/renderer, prompt builders, runner, and acceptance belong in owned `src/change/proposals/*` modules, while `src/change/proposals.ts` remains the compatibility facade. Phase 8I extends the same rule to DemandWorker: schema/type, path/artifact, repository, decision, queue projection, slot policy, claim, lifecycle, and reconcile modules own DemandWorker internals while `src/demand-worker/manager.ts` stays a compatibility facade. Phase 8J extends the rule to TaskRun / WorkerLease: schema/type, path/artifact, repository, lease, guard, start/retry, reconcile, and workflow-result modules own TaskRun internals while `src/task-run/manager.ts` stays a compatibility facade. Phase 8K extends the rule to workflow artifacts: schemas/types, paths/ref resolving, hashing, guards, DecompositionPlan, readiness manifest, TaskQueueProposal, WorkflowGraphPlan, and rendering modules own typed workflow artifact internals while `src/workflow-artifacts/manager.ts` stays a compatibility facade. Phase 8L extends the rule to WorkflowRun: schemas/types, paths, repository, events, guards, recovery key, proposal-start validation, lifecycle sync, stage resume, and summary modules own WorkflowRun internals while `src/workflow-run/manager.ts` stays a compatibility facade. Phase 8M extends the rule to Change lifecycle: schemas/types, paths, metadata, templates, repository, creation, status, close-gate, lifecycle, and guards own Change internals while `src/change/manager.ts` stays a compatibility facade. Phase 8N extends the rule to Run evidence: schemas/types, artifact paths, repository, events, run id, context projection, local command runner, and guards own Run internals while `src/run/manager.ts` stays a compatibility facade. Phase 8P extends the rule to Validation and Audit evidence: schemas/types, repository, run session, context, runner, result writer, status, guards, and audit acceptance modules own Validation/Audit internals while `src/validation/manager.ts` and `src/audit/manager.ts` stay compatibility facades. Phase 8Q extends the rule to residual Workbench action handlers: handler maps and landing/PR/remote/post-merge/control action glue belong in owned `src/workbench/actions/handlers/*` modules while `src/workbench/chat.ts` stays a conversation/action facade.
- Coder execution must use an AHO-owned worktree checkout as cwd.
- Source project root is read/context only during Coder execution.
- Coder prompt profiles are product assets and must encode ECL source-of-truth order, explore-first discipline, smallest coherent diff, and proposal-only status.
- A Coder run may produce a dirty worktree and diff artifacts, but it must not apply, merge, close, archive, or evolve Harness rules.
- If the source project root changes during a Coder run, the run is failed and preserved as evidence.

Apply/discard boundary:

- `aho worktree apply` is the explicit human adoption command for a validated and audited worktree diff.
- Apply is not merge, PR, push, or close.
- Apply requires matching `worktreeDiffHash` across the current worktree diff, validation evidence, audit evidence, and accepted review.
- Apply requires a clean source repo and unchanged source `HEAD`; AHO does not auto-merge, rebase, or resolve conflicts.
- `aho worktree apply --commit` is explicit commit confirmation. Without `--commit`, source changes remain uncommitted and block close until committed or cleaned.
- `aho worktree discard` only discards an unapplied worktree proposal. It does not revert source repo changes.

## 15. Validation and Auditor Boundary

Validation and audit are separate gates.

Validation answers whether commands and checks passed. Audit answers whether the change appears correct, aligned with the spec, and safe to apply.

Decisions:

- Validation results should be mechanical and artifact-backed.
- Validation is scoped to a Change and must not be treated as project-wide blanket approval.
- In early phases, no validation is warning-only while latest failed validation is blocking.
- In Phase 3C, no audit and failed audit are warning-only; only explicit `blocked` audit status blocks close.
- In Phase 3D, Coder self-reported verification is not authoritative validation.
- Auditor output is a proposal and cannot apply or merge by itself.
- A Coder run that passes validation can still be rejected by audit or human review.
- In Phase 3E, apply requires validation and audit evidence for the exact current worktree diff hash, not just the same change or worktree id.
- Phase 8P requires Validation/Audit artifacts to prove directory id, artifact id, run id, and Change scope before direct read, accept, close gate, apply gate, spec-test, task reconcile, queue reconcile, or workflow stage resume paths trust them.
- Phase 8P list/projection paths skip malformed, forged, misplaced, or cross-Change Validation/Audit evidence; direct read/show/accept paths fail closed.
- `acceptAudit()` must reject forged or misplaced audit evidence and must validate any referenced validation evidence under the same Change scope.

Spec and Planner agents exist to prepare canonical ECL artifacts, not to bypass them.

- `aho change spec propose` is read-only and proposal-only.
- `aho change spec accept` is the human confirmation command that writes `spec.md`.
- `aho change plan propose` is read-only and proposal-only.
- `aho change plan accept` is the human confirmation command that writes `plan.md` and `tasks.md`, then rebuilds `ac-map.json`.
- Spec Agent must stay in WHAT/WHY; Planner must stay in HOW/tasks.
- Accept commands are stale-safe and must not overwrite user edits made after proposal generation.
- Accepting spec or plan does not run code, validation, audit, apply, close, or spec-test evidence acceptance.

Spec-Test mapping links Acceptance Criteria to test or validation evidence. It is evidence, not proof.

- `spec-tests.json` records explicit links from AC IDs to files, test names, validation commands, or notes.
- File existence and command validation status can be checked mechanically.
- Test names are human-auditable labels only in Phase 4A; AHO does not parse runner output.
- Phase 4B may ask Codex to propose existing evidence, but Codex must not directly edit `spec-tests.json`.
- AHO writes accepted evidence only after an explicit human confirmation command.
- In Phase 4B, only `source-root` `existingEvidence` can be accepted. Worktree-only evidence, suggested new tests, open questions, and unknown evidence stay proposal-only.
- Phase 4C may ask Codex to generate missing passing test evidence in an AHO-owned worktree, but the generator is test-only and proposal-only.
- Phase 4C generated tests do not become source-root evidence until validation, audit, human apply, and a later `spec-test propose` / `proposal accept` pass.
- Phase 4C rejects generator diffs that touch production code, package manifests, docs, Harness files, or `.agent-harness`.
- Phase 4C does not support accepted red tests; failing generated tests remain worktree proposals and must not be applied as evidence.
- Phase 4D drift diagnostics are deterministic risk signals. They do not call Codex, do not generate tests, and do not prove AC coverage.
- `stale` means the evidence may need refresh because validation or spec/task timestamps no longer line up; it is not proof that code and spec are inconsistent.
- `spec-test check --strict` can fail on invalid, stale, or failed accepted evidence, but missing evidence remains warning-only in Phase 4D.
- Missing linked evidence is warning-only. Broken linked evidence, such as a missing referenced file, is blocking.
- Later drift gates may become stricter only after the mapping and generation flows are stable.
- A failed validation should produce evidence for fixing code, improving specs, or evolving Harness rules.
- Spec-linked validation starts as warnings until the mapping model is mature enough to fail CI reliably.

## 16. Declarative Agent Spec Boundary

Future multi-agent scheduling must use declared roles, scoped Runs, artifacts, and approvals.

Decisions:

- Current bundled role profiles remain role contracts.
- Future Agent Specs should declare role id, description, allowed inputs, allowed outputs, write capability, preferred runtime, human confirmation requirements, and whether delegation is allowed.
- Role/subagent declarations may guide future schedulers, but they must not replace accepted specs, plans, tasks, or human gates.
- Multi-agent collaboration must not depend on a shared unbounded chat transcript.

## 17. Harness Evolution Boundary

Harness evolution improves the collaboration system, not business code directly.

Allowed evolution targets:

- process rules
- templates
- ECL guidance
- lint checks
- validation defaults
- documentation
- agent routing guidance

Decisions:

- Evolution evidence comes from archived changes, validation failures, repeated user corrections, spec drift, weak acceptance criteria, and review findings.
- Evolution must use evidence, proposal, review, validation, and human approval.
- Evolution must not automatically edit business code.
- Evolution must not silently rewrite business specs.
- No independent review means no automatic apply.

## 18. Public Repo vs Local Harness Boundary

The open-source repository should remain a usable product repository, not a dump of local agent work history.

Public assets:

- product source code
- public docs
- tests
- templates
- package and build configuration

Local development state by default:

- active and archived local changes
- reference project checkouts
- run logs and events
- worktrees
- local registry
- temporary artifacts

Decisions:

- Product Harness templates are public assets.
- This repository's own local Harness workspace is development state.
- Publishing internal ECL history is optional and must not be required for users to clone, install, or understand the product.
- External-local memory strengthens this boundary by keeping private run history and project-specific agent state outside the business repository.
- Project markers must not contain secrets, user home paths, or machine-specific credentials.

## 19. Deferred Boundaries

These areas are intentionally deferred:

- team permissions
- cloud sync
- remote managed agents
- remote memory gateway/server
- cross-project knowledge memory
- hosted dashboard
- container sandbox by default
- credential vault implementation
- automatic merge
- full Spec-to-Test generation
- CI drift failure gates for all changes
- L3 Spec-as-Source workflow

Each requires a future architecture decision before implementation.

## 20. Current Defaults

Current defaults:

- local-first
- personal-first
- explicit opt-in
- demand-conversation user surface with internal Change-driven workflow
- Spec-Anchored direction
- repo-local Harness/docs/artifacts as current implementation
- external-local as the target personal memory mode
- remote memory deferred as future authoritative team mode
- Codex-style tools treated as disposable executors
- worktree isolation as the preferred direction
- all high-impact agent outputs require human confirmation
- no automatic merge
- no automatic Harness evolution apply
- public repo excludes local Harness runtime history by default
