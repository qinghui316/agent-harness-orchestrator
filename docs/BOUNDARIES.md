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

## 1A. Orchestration Authority Matrix

Continuous main-agent orchestration is allowed only above existing Harness
truth. It may observe evidence, recommend next steps, and delegate bounded leaf
roles through explicit gates; it must not replace the workflow authority model.

| Artifact or surface | Role | Executable by itself | Workflow truth |
| --- | --- | --- | --- |
| Change/ECL files, accepted spec/plan/tasks/AC | Canonical demand state | No | Yes |
| Run, Validation, Audit, Worktree, Apply/Close records | Evidence and gated transitions | Only through existing gated actions | Yes for their domain |
| `confirmationQueue.primary` | Current human decision surface | Yes, after explicit confirmation and revalidation | Projection of current legal gate |
| `MainAgentDecision` / next-step packet / controller verdict | Recommendation and prompt context | No | No |
| LLM strategy advice | Bounded read-only strategy evidence | No | No |
| WorkflowGraphPlan / WorkflowRun journal / recovery key | Execution structure and recovery evidence | No | No |
| Workpad, transcript, Agent graph, runtime log, diagnostics | User-facing projections | No | No |
| Worker `AgentTaskResult` | Leaf-role result evidence | No | No; must pass validation/audit/gates |

`逐步确认` exposes one current legal gate at a time. `自动推进` may consume
only current-Change local allowed gates after an accepted plan and must stop at
stale evidence, failure, ambiguity, completion, or any high-impact human gate.
Neither mode may auto-confirm planning, raw scheduler dispatch, manual
IntegrationCheck, integration apply/discard, remote/PR/merge, or Harness
evolution.

LLM strategy advice is not a workflow truth source, gate, controller, or
automation authority. It may influence the internal main-agent strategy kind
only through the bounded strategy-policy evidence envelope; it must not write
strategy JSONL, alter `confirmationQueue`, change scoped automation allowlists,
or drive action execution. Real main-agent runs may produce advice only as
same-run, same-Change metadata; it is stripped from visible transcript / plan /
live deltas and is passed explicitly to policy instead of being recovered from
historical replay.

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
- A Workbench conversation id is not a Harness Change id. Ordinary chat does
  not create workflow truth; planning, gated actions, apply, and close must
  carry explicit Harness Change scope.
- Provider runtime scope is not Harness Change scope. Ordinary main-agent
  chat may use a conversation/runtime scope, while workflow actions must carry
  explicit Change scope only when they cross into Harness planning, gated
  execution, apply, or close.
- Workbench must not infer child-agent delegation by parsing visible main-agent
  text, user keywords, or fixed phrases. Child Agent / plan surfaces may appear
  only from real provider runtime ownership metadata or explicit Harness
  workflow actions.
- Deleting a Workbench conversation is a conversation-layer cleanup only. It
  must not close, abandon, cancel, move, archive, or garbage-collect any
  Harness Change, ECL files, workflow evidence, ResumePoint, current gate, or
  source state.
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

AHO may use Codex plugin and skill discovery as a runtime delivery mechanism,
but Skills are runtime capabilities, not Harness workflow authority.

Decisions:

- Skill sources may be native Codex skills, AHO-managed memory skills,
  project Codex skills, or user-registered custom roots. The catalog records
  source path, source kind, and source hash. `$CODEX_HOME/skills` is discovered
  by default as read-only native Codex runtime capability, not copied project
  memory.
- SQLite records skill roots, project/topic enablement, and bridge sync state.
- `~/.codex/plugins/aho-managed` is a rebuildable runtime projection.
- AHO must not overwrite user Codex skills, oh-my-codex skills, or global Codex configuration.
- Native Codex Skills remain native and must not be copied into the AHO bridge.
  Bridge install/sync is explicit for custom, managed, and non-native project
  Skill packages; runs may warn when the bridge is out of sync but must not
  secretly write to `~/.codex`.
- Skill packages may include supporting content such as `references/`,
  `examples/`, and `scripts/`. AHO may materialize that package for Codex, but
  AHO must not directly execute skill scripts.
- Runs record enabled skill ids, runtime target, source hashes, and materialized
  hashes so Codex behavior can be audited later.

## 6A.1 Hybrid Desktop Native Boundary

AHO's long-term desktop product may use a Tauri/Rust host and native adapter
layer, but the current Node/TypeScript AHO core remains the owner of Harness
workflow truth and product orchestration.

Decisions:

- Node/TypeScript continues to own Change/ECL, accepted artifacts, Workbench
  APIs, Codex bridge, Skills, Goal Loop, Scheduler, SQLite interaction stores,
  and project registry behavior.
- A future Tauri/Rust shell may own desktop host responsibilities such as
  windows, native menus, tray, updater, native dialogs, notifications, and
  packaging.
- Native-heavy tools such as Terminal PTY, file watcher, native file dialogs,
  runtime log collection, and system notifications must enter through explicit
  adapter/service owners. They must not be scattered through React components,
  broad server facades, or Harness workflow modules.
- Terminal V1 may use Node `node-pty` behind a `TerminalRuntime`-style owner.
  A future Tauri build may replace that owner with Rust `portable-pty` without
  changing Workbench UI or public Terminal APIs.
- Native tools are user/project tools and runtime adapters. They do not become
  validation, audit, apply, close, scheduler, remote, PR, merge, or Harness
  evolution authority.
- Packaging is distribution and process management. It must not turn auto
  update, native shell startup, terminal output, or local process state into
  workflow truth.

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

Architecture growth control extends the same boundary from module placement to mechanism reuse. Feature modules may own domain-specific rules, rendering, and orchestration adapters, but shared artifact storage, lineage checks, stale revalidation, authority classification, ledger event policy, projection summary building, human-gate evidence, and ToolPolicy-related checks must not be scattered into feature-local private systems. If a feature needs a new cross-cutting capability, the change must either strengthen an existing owner or introduce a reusable owner with clear boundaries before adding feature-specific branches. File count and line count remain signals; the boundary question is whether the change lowers the cost and risk of the next similar feature.

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

Phase 9H adds `planning.scheduler.worker.reconcile-result` as the matching single-worker result gate. `src/scheduler-runtime/worker-result.ts` owns result reconciliation, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve full SchedulerRun / WorkerStart / ClaimReservation / reservation intent / TaskRun / WorkerLease / worktree / run scope, must require the code Run to use the scheduler-specific execution gate, and must fail closed for forged, stale, cross-Change, or mismatched evidence. It may write one scheduler-owned worker result, update the linked TaskRun to `evidence-ready` or `failed`, and release the linked WorkerLease only after terminal code evidence. It must not start validation, audit, bounded rework, a second worker, whole-wave dispatch, a scheduler loop, slot allocation, apply/landing, child Changes, or full parallel executor behavior.

Phase 9I adds `planning.scheduler.worker.validate-first` as the single-worker validation gate. `src/scheduler-runtime/worker-validation.ts` owns validation gating and scheduler-owned validation evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve full SchedulerRun / WorkerResult / WorkerStart / ClaimReservation / reservation intent / TaskRun / WorkerLease / worktree / coder Run / validation Run scope, must require the coder Run to use the scheduler-specific execution gate, and must fail closed for forged, stale, cross-Change, or mismatched evidence. It may run exactly one existing Validation path against the same worker worktree, write one scheduler-owned validation sidecar, keep the TaskRun `evidence-ready` when validation passes, and mark the TaskRun `blocked` when validation fails. It must not start audit, bounded rework, a second worker, whole-wave dispatch, a scheduler loop, slot allocation, apply/landing, child Changes, or full parallel executor behavior.

Phase 9J adds `planning.scheduler.worker.audit-first` as the single-worker audit gate. `src/scheduler-runtime/worker-audit.ts` owns audit gating and scheduler-owned audit evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve full SchedulerRun / WorkerValidation / WorkerResult / WorkerStart / ClaimReservation / reservation intent / TaskRun / WorkerLease / worktree / coder Run / validation Run / audit Run scope, must bind Audit to the exact validation run recorded by Phase 9I, and must fail closed for forged, stale, cross-Change, wrong-worktree, wrong-code-gate, or mismatched evidence. It may run exactly one existing Audit path against the same worker worktree, write one scheduler-owned audit sidecar, complete the TaskRun only when audit is `approved` / `approved-with-notes`, and block the current worker path when audit is `blocked` / `failed`. It must not start bounded rework, a second worker, whole-wave dispatch, a scheduler loop, slot allocation, apply/landing, child Changes, or full parallel executor behavior.

Phase 9K adds `planning.scheduler.worker.rework-plan.compile` as a non-executing single-worker rework planning gate. `src/scheduler-runtime/worker-rework-plan.ts` owns rework-plan gating and scheduler-owned `SchedulerRuntimeWorkerReworkPlan` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must accept only validation failed or audit blocked/failed first-worker states, preserve full SchedulerRun / RuntimeState / ClaimReservation / WorkerStart / WorkerResult / WorkerValidation / optional WorkerAudit / TaskRun / worktree / Run scope, and fail closed for forged, stale, cross-Change, approved, or unrelated evidence. It must not call `startCodeRun()`, add code execution gates, create TaskRuns, WorkerLeases, WorkerSessions, RuntimeWorkspaces, EventSources, worktrees, runs, AgentTasks, WorkflowRuns, TaskQueueRuns, child Changes, or start rework.

Phase 9L adds `planning.scheduler.worker.rework-start-first` as the first same-worktree scheduler rework execution gate. `src/scheduler-runtime/worker-rework.ts` owns rework-start gating and scheduler-owned `SchedulerRuntimeWorkerReworkStart` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve full SchedulerRun / RuntimeState / ClaimReservation / WorkerStart / WorkerResult / WorkerValidation / optional WorkerAudit / ReworkPlan / original TaskRun / target worktree / blocking Run scope, and must fail closed for forged, stale, cross-Change, duplicate, wrong-worktree, or unrelated evidence. Code execution must use `executionGate.mode = "scheduler-claim-rework"`; `existingWorktreeId` is valid only for that mode and must be rejected by direct, TaskQueue, generic rework, and scheduler reservation code gates. Phase 9L may create one rework TaskRun, one rework WorkerLease, one same-worktree rework code Run, and Runtime Continuity sidecars. It must not create a new worktree, validate/audit/reconcile the rework result, start another worker or whole wave, run a scheduler loop or slot allocator, create child Changes, run IntegrationCheck/apply/PR/merge, or act as the final multi-worktree merge path.

Phase 9M adds `planning.scheduler.worker.rework-reconcile-result` as the first same-worktree scheduler rework result reconcile gate. `src/scheduler-runtime/worker-rework-result.ts` owns rework-result gating and scheduler-owned `SchedulerRuntimeWorkerReworkResult` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve full SchedulerRun / RuntimeState / ClaimReservation / ReworkPlan / ReworkStart / original worker lineage / rework TaskRun / rework WorkerLease / worktree / rework Run scope, and must fail closed for forged, stale, cross-Change, duplicate, wrong-gate, wrong-worktree, or unrelated evidence. Rework code evidence must use `executionGate.mode = "scheduler-claim-rework"`. Phase 9M may mark the rework TaskRun `evidence-ready` or failed and release the rework WorkerLease. It must not start validation, audit, another rework, another worker or whole wave, run a scheduler loop or slot allocator, create child Changes, create new worktrees/runs, run IntegrationCheck/apply/PR/merge, or act as the final multi-worktree merge path.

Phase 9N adds `planning.scheduler.worker.rework-validate-first` as the first same-worktree scheduler rework validation gate. `src/scheduler-runtime/worker-rework-validation.ts` owns rework-validation gating and scheduler-owned `SchedulerRuntimeWorkerReworkValidation` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve full SchedulerRun / RuntimeState / ClaimReservation / ReworkPlan / ReworkStart / ReworkResult / original worker lineage / rework TaskRun / rework WorkerLease / worktree / rework Run / validation Run scope, and must fail closed for forged, stale, cross-Change, duplicate, wrong-gate, wrong-worktree, or unrelated evidence. Rework code evidence must use `executionGate.mode = "scheduler-claim-rework"`, and validation must target the same reused worktree without source-root fallback. Phase 9N may keep the rework TaskRun `evidence-ready` or mark it `blocked`; it must not start audit, another rework, another worker or whole wave, run a scheduler loop or slot allocator, create child Changes, create new worktrees/runs, run IntegrationCheck/apply/PR/merge, or act as the final multi-worktree merge path.

Phase 9O adds `planning.scheduler.worker.rework-audit-first` as the first same-worktree scheduler rework audit gate. `src/scheduler-runtime/worker-rework-audit.ts` owns rework-audit gating and scheduler-owned `SchedulerRuntimeWorkerReworkAudit` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve full SchedulerRun / RuntimeState / ClaimReservation / ReworkPlan / ReworkStart / ReworkResult / ReworkValidation / original worker lineage / rework TaskRun / rework WorkerLease / worktree / rework Run / validation Run / audit Run scope, and must fail closed for forged, stale, cross-Change, duplicate, wrong-gate, wrong-worktree, externally-completed, or unrelated evidence. Rework audit must target the same reused worktree and exact Phase 9N validation id without source-root fallback or latest generic evidence lookup. Phase 9O may complete the rework TaskRun only when audit is `approved` / `approved-with-notes`; it must not start another rework, another worker or whole wave, run a scheduler loop or slot allocator, create child Changes, create new worktrees/runs, run IntegrationCheck/apply/PR/merge, or act as the final multi-worktree merge path.

Phase 9P adds `planning.scheduler.integration-candidate.compile` as the scheduler output bridge back into AHO's existing multi-worktree integration safety chain. `src/scheduler-runtime/integration-candidate.ts` owns integration-candidate gating and scheduler-owned `SchedulerIntegrationCandidate` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve SchedulerRun / RuntimeState / latest ClaimReservation / worker audit / rework audit / TaskRun / WorkerLease / worktree / code gate / validation / audit scope, must fail closed or block outputs for forged, stale, cross-Change, duplicate, wrong-gate, already-applied, source-drifted, or not-ready evidence, and must re-run `previewWorktreeApply()` / `classifyApplyReadiness()` for each accepted output. Phase 9P must not run IntegrationCheck, aggregate validation/audit, apply, landing, PR, merge, next-worker dispatch, whole-wave dispatch, scheduler loops, slot allocation, child Changes, or create new worktrees/runs.

Phase 9Q adds `planning.scheduler.integration-check.run` as the scheduler handoff bridge into the existing IntegrationCheck path. `src/scheduler-runtime/integration-check-handoff.ts` owns handoff gating and scheduler-owned `SchedulerIntegrationCheckHandoff` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must preserve SchedulerRun / RuntimeState / latest ClaimReservation / latest SchedulerIntegrationCandidate / ready worktree / validation / audit / diff hash / source HEAD scope, must fail closed for forged, stale, cross-Change, duplicate, drifted, or not-ready targets, and must use existing `runIntegrationCheck(project, worktreeIds)` rather than a new integration engine. Phase 9Q must not apply/discard, landing, PR, merge, start next workers, whole-wave dispatch, scheduler loops, slot allocation, child Changes, or create new worktrees/runs outside the existing IntegrationCheck temporary workspace behavior.

Phase 9R adds `planning.scheduler.integration-outcome.reconcile` as the scheduler outcome bridge from existing IntegrationCheck terminal state back into scheduler-owned evidence. `src/scheduler-runtime/integration-outcome.ts` owns outcome gating and `SchedulerIntegrationOutcome` evidence, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must re-read current IntegrationCheck state, latest handoff, RuntimeState, target set, source hashes, and target worktree metadata; it must write no outcome while IntegrationCheck is still `passed`; it must require applied worktree evidence for `applied`; and it must reject `discarded` if any target has applied evidence. Phase 9R must not call apply/discard APIs, mutate source root, bypass aggregate validation/audit, landing, PR, merge, next-worker dispatch, whole-wave dispatch, scheduler loops, slot allocation, child Changes, or full parallel executor behavior.

Phase 9S adds `planning.scheduler.worker.start-next` as the scheduler next-worker gate. `src/scheduler-runtime/worker-start.ts` owns start-next selection and guard logic, while Workbench/server/frontend code only dispatches the action and displays summaries. The action must require explicit `schedulerRunId`, `schedulerClaimReservationId`, `reservationIntentId`, and `claimIntentId`, re-read latest SchedulerRun/RuntimeState/ReconcileSnapshot/ClaimReservation and prior worker evidence, reject stale or duplicate reservation intents, and fail closed if any prior worker path is unresolved. Phase 9S may create exactly one coder TaskRun, one WorkerLease, one worktree, one code run, and Runtime Continuity sidecars. It must not start validation, audit, rework, result reconcile, IntegrationCheck, apply, landing, PR, merge, whole-wave dispatch, scheduler loops, slot allocation, child Changes, or full parallel executor behavior.

Phase 9T requires current-worker quality gates and integration candidate refresh to be decided by scheduler-runtime owned helpers, not broad Workbench facades. Workbench may display and dispatch `validate-first` / `audit-first` / rework compatibility action ids, but user-facing labels must describe the current worker path once start-next exists. If approved worker or rework audit outputs are not covered by the latest scheduler integration candidate, the only primary next action is candidate refresh; stale candidates must not unlock IntegrationCheck or another worker decision.

Phase 9U requires the two-worker acceptance surface to stay inside those same boundaries. A second worker may only be started by the existing start-next gate after prior worker paths are terminal and the latest candidate proves one ready output. Current-worker quality gates must target the selected worker path and preserve scoped ids. Candidate refresh must run before IntegrationCheck handoff when a later approved output is not covered. Phase 9U must not add scheduler loop, whole-wave dispatch, slot allocation, apply/discard, landing, PR, merge, child Change creation, or full parallel executor behavior.

Phase 9V keeps scheduler integration outcome reconciliation inside `src/scheduler-runtime/integration-outcome.ts`. The owner module must re-read latest `SchedulerIntegrationCandidate`, latest `SchedulerIntegrationCheckHandoff`, runtime state, IntegrationCheck state, and target worktree metadata before recording an outcome. Existing `apply-check.apply` and `apply-check.discard` remain the only source-root mutation/terminal confirmation path; scheduler code must not add its own apply/discard action or mutate source root during outcome reconciliation.

Phase 9W keeps scheduler integration event/projection hardening inside `src/scheduler-runtime`. Scheduler integration events may summarize candidate compile, IntegrationCheck handoff, and terminal outcome recording, but they must derive canonical scope from SchedulerRun/Change state and must not become execution authorization. Workbench, server, frontend, IntegrationCheck, and apply/discard modules may consume or display this evidence, but must not own the integration event implementation or use it to bypass existing gates.

Phase 9X keeps SchedulerRun terminal completion inside `src/scheduler-runtime` with only thin SchedulerRun status/journal persistence in `src/workflow-scheduler`. Completion may summarize applied, discarded, or blocked scheduler integration outcomes for recovery/projection, but it must not create a scheduler-owned apply/discard action, mutate source root, run IntegrationCheck, start workers, dispatch whole waves, allocate slots, create child Changes, or bypass existing IntegrationCheck/apply/human gates.

Phase 9Y keeps the next step at the acceptance boundary. It may add tests, fixtures, and documentation proving the scheduler Workbench path is recoverable and honest, but it must not add new runtime authority. Any product fix must stay in the responsible owner module; no main implementation may be written back into Workbench chat/server/read-model shells, frontend shell, action registry facade, or manager facades.

Phase 9Z keeps the blocked/exhausted closeout boundary in `src/scheduler-runtime/`. `SchedulerRunBlockedCloseout` is terminal scheduler evidence for a run that cannot reach IntegrationCheck and has no legal next-worker path; it is not `SchedulerRunCompletion`, because completion remains tied to IntegrationCheck outcome/apply-discard evidence. Closeout is forbidden after IntegrationCheck handoff, SchedulerIntegrationOutcome, SchedulerRunCompletion, ready target count `>= 2`, stale candidate evidence, source hash drift, or a legal next-worker continuation. It must not run workers, validation, audit, rework, IntegrationCheck, apply/discard, landing, PR, merge, slot allocation, scheduler loop, child Change creation, new worktrees, or new runs.

Phase 10A keeps scheduler user-surface consolidation in owned modules. `src/scheduler-runtime/` remains the domain owner for scheduler legality and evidence; Workbench scheduler handler modules and confirmation read-model helpers may map existing scheduler action ids to user-facing labels and dispatch one scoped transition at a time. They must not own scheduler runtime decisions, hide multiple high-impact transitions behind one confirmation, bypass ToolPolicyGate or stale-target revalidation, write scheduler logic into `chat.ts`, server routes, frontend shells, projection facades, CLI modules, or manager facades, or create a scheduler loop, start-all control, slot allocator, source apply path, child Change path, or full parallel executor.

Phase 10B adds the Goal Loop Boundary. Future autonomous or semi-autonomous main-agent loops may keep a persistent Goal/Change and repeat `act -> observe -> reason -> repeat`, but they are policy over evidence, not a new workflow truth. A loop must not bypass Change/ECL, accepted artifacts, owner modules, ToolPolicyGate, Validation, Audit, IntegrationCheck, Apply/Close human gates, or Harness evolution. Low-conflict independent tasks may be considered for parallel worker/worktree slices only when conflict/source scope evidence supports that decision. High-conflict, same-file, ordering-dependent, or ambiguous tasks must wait for predecessor evidence, run sequentially, or enter rework / IntegrationFix. Multi-worktree parallel development is not merge proof; final source mutation must route through SchedulerIntegrationCandidate, existing IntegrationCheck, aggregate validation/audit, and human apply gate.

Phase 12A records the design boundary for a future controlled Scheduler loop in `docs/design-docs/controlled-scheduler-loop.md`. That design may guide later implementation of repeated evidence observation, conflict routing, bounded dispatch, reconcile, integration barriers, and terminal human-gate handoff. It does not implement scheduler loop runtime, whole-wave dispatch, slot allocation, worker auto-start, Workbench actions, ToolPolicy changes, child Change creation, source mutation, automatic apply/merge/close, or Harness evolution automation. Any later implementation must fail closed for stale, forged, superseded, missing, or cross-Change loop/scheduler targets and must extend owned Goal Loop, workflow-scheduler, scheduler-runtime, validation, audit, ToolPolicy/action-dispatch, integration-check/apply, and Workbench projection modules rather than broad facades.

Phase 10C adds the `GoalLoopDecision` boundary. `src/goal-loop/` owns the decision schema, repository, renderer, and compiler. Workbench/server/frontend code may dispatch `planning.goal-loop.evaluate` and display the summary, but must not own the decision policy. `GoalLoopDecision` may recommend an existing action only when that action's required scope ids are present and valid; otherwise it must wait or block. It must not import Workbench, server, web, CLI, broad facades, or worker-start implementations, and it must not start workers, allocate leases, create runtime sidecars, run IntegrationCheck, mutate source, close Changes, or mark the Goal complete without evidence and the existing human gate.

Phase 10D adds the Goal Loop confirmation-surface boundary. `src/workbench/projections/read-model/confirmation/goal-loop.ts` may build a fallback `planning.goal-loop.evaluate` queue item for the selected active Change, but only after existing concrete confirmations are assembled and only when none exist. It must not be implemented as `workpad.nextAction`, must not expose `GoalLoopDecision.recommendedAction` as an executable action, and must not bypass the workflow-action ToolPolicyGate / human gate path.

Phase 10E adds the `GoalLoopIteration` boundary. `src/goal-loop/` owns iteration schema, paths, repository, renderer, and compile/write orchestration. Each iteration links the previous and current Goal Loop evidence for the selected Change, but remains `non-executing-continuation-evidence`. Workbench/server/frontend code may record and display iteration ids, but must not infer executable authority from an iteration, generate new confirmations from `recommendedAction`, or use iterations to start workers, scheduler loops, IntegrationCheck, apply/close, source mutation, or child Changes.

Phase 10F adds continuation-state fields to `GoalLoopIteration`. These fields are derived control constraints, not a new truth source. They must not replace Change/ECL state, SchedulerRun state, Workbench confirmation priority, Validation/Audit/IntegrationCheck evidence, ToolPolicyGate, or Apply/Close human gates. Budget/accounting values must remain evidence signals and must not copy Codex token-accounting runtime behavior unless AHO later introduces a scoped owner module for it.

Phase 10G adds the `GoalLoopContinuationBrief` boundary. `src/goal-loop/` owns the brief schema, paths, repository, renderer, and derivation from the latest non-executing iteration. Workbench/server/frontend code may record or display the brief artifact, but must not use it to auto-continue, create a hidden prompt turn, start scheduler workers, run IntegrationCheck, mutate source, close a Change, or generate a new confirmation from `recommendedAction`. A brief is stale unless the next main Agent re-reads the selected Change and current evidence.

Phase 10H adds the Workbench projection boundary for Goal Loop resume evidence. `src/goal-loop/`
continues to own durable artifacts; `src/workbench/projections/read-model/goal-loop.ts` may only map
latest valid artifacts into a compact Workpad summary. Projection code must not compile Goal Loop
evidence, run actions, derive new confirmations, mutate source, or treat `recommendedAction` as
execution authority. Corrupt or cross-scope Goal Loop files must be skipped in projection paths.

Phase 10I adds the `GoalLoopNextStepPacket` boundary. `src/goal-loop/` owns packet schema, paths, repository, renderer, and derivation. Workbench projection may display packet metadata and artifact refs, but must not generate confirmations, actions, route calls, hidden turns, scheduler starts, source mutation, close authority, or any execution from the packet. A packet is stale unless the main Agent revalidates current Change evidence and the corresponding concrete Harness gate.

Phase 10J adds the main-Agent context-consumption boundary for that packet. `src/goal-loop/` owns packet lineage validation and prompt-section rendering. Workbench chat/orchestrator code may include the rendered section, but must not parse packet authority itself or inject the section into worker prompts. Packet context can explain the next safe step; it cannot dispatch a workflow action, bypass ToolPolicyGate/human gates, start scheduler/runtime work, close a Change, or mutate source.

Phase 10K adds the existing-gate recommendation boundary. `src/goal-loop/` may map current scheduler worker, rework, integration, completion, and closeout evidence to an existing `WorkflowActionType` plus required target ids, but only as non-executing recommendation evidence. It must validate required targets, keep `executionStarted=false`, preserve `canAutoContinue=false`, and avoid importing Workbench/server/web/CLI/action-handler modules. Concrete Workbench confirmations remain the execution surface and retain ToolPolicyGate, stale-target, decision/audit, and human-gate authority.

Phase 10L adds the Goal Loop packet freshness boundary. `src/goal-loop/` owns the read-only comparison between the latest packet and current Goal Loop evidence. Workbench prompt/projection code may call that helper, but must not implement freshness policy itself. A stale or superseded packet must not be injected as main-Agent context or shown as current Workpad recommendation. Freshness checks must not write new artifacts, generate confirmations, call action handlers, start scheduler/runtime work, mutate source, close a Change, or weaken concrete gate stale-target revalidation.

Phase 10M adds the Goal Loop packet confirmation-parity boundary. `src/goal-loop/` continues to own packet evidence and freshness; Workbench read-model/context code owns the comparison to the current visible Harness gate. A packet recommendation must not appear as current guidance unless its action type and declared target ids match the selected demand's enabled confirmation gate. Workbench must not use packets to create, prioritize, mutate, or execute confirmation queue items, and the concrete gate's stale-target revalidation, ToolPolicyGate, decision/audit scope, and human confirmation remain unchanged.

Phase 10N adds the Goal Loop feedback boundary. `src/goal-loop/` owns `GoalLoopFeedback` schema, paths, repository, rendering, and compiler consumption. Workbench/server/frontend code may collect scoped feedback and dispatch a feedback re-evaluation action, but must not own feedback policy or treat raw feedback as executable instructions. Feedback must bind the selected Change, current packet lineage, recommended action scope, and current visible gate; stale, cross-Change, or mismatched feedback must fail closed. A feedback re-evaluation must not execute recommendations, generate confirmations from text, start scheduler/runtime work, mutate source, close a Change, or bypass ToolPolicyGate/human gates.

Phase 10O adds the Goal Loop feedback surface boundary. `src/workbench/projections/read-model/confirmation/goal-loop.ts` may attach a secondary feedback action to an already-visible concrete confirmation item, and `src/web/src/App.tsx` may route that inline feedback through the existing workflow action live endpoint. These layers must remain thin surface bridges: they must not compile Goal Loop artifacts directly, parse arbitrary conversation text as feedback, create new primary confirmation items, execute the recommended action, or weaken the server-side packet/gate stale revalidation owned by the existing `planning.goal-loop.feedback.evaluate` handler.

Phase 10P adds the Goal Loop feedback refresh acceptance boundary. Workbench/frontend code may improve action-result wording and verify that the live snapshot after feedback exposes the refreshed Goal Loop summary, but it must not change Goal Loop artifact policy, generate confirmations from feedback text, execute recommendations, create a hidden controller, or weaken the concrete gate's stale-target revalidation, ToolPolicyGate, decision/audit scope, or human confirmation.

Phase 10Q adds the Goal Loop controller policy boundary. `src/goal-loop/` owns controller policy schema, paths, repository, rendering, and compilation. Workbench projection code may display the latest valid verdict, but must not own the policy, generate actions from it, call handlers, or mutate confirmation queue state. A controller verdict is derived evidence only; it may recommend the existing visible gate, wait, suppress stale/stale-mismatched guidance, or report blocked state, but it must not execute the recommendation, start scheduler/runtime work, run validation/audit/IntegrationCheck, mutate source, close/apply, or bypass ToolPolicyGate/human gates.

Phase 10R adds the Goal Loop controller policy refresh boundary. Workbench confirmation code may attach a secondary refresh action to an already-visible concrete Harness gate only when the latest Goal Loop packet matches that gate's action type and target ids. The refresh action may pass the current gate snapshot into `src/goal-loop` and record controller policy evidence, but it must not become a primary gate, generate queue items from policy, execute recommendations, call concrete action handlers, mutate source, or weaken the concrete gate's stale-target revalidation, ToolPolicyGate, decision/audit scope, or human confirmation.

Phase 10S adds the Goal Loop controller policy main-Agent context boundary. `src/goal-loop/` owns strict lineage checks and prompt-context rendering for controller policy evidence. Workbench codex-chat code may expose that rendered section only when the selected Workpad projection exposes the same current packet and policy. It must not inject policy into worker prompts, generate actions from policy, call handlers, mutate confirmation queues, start scheduler/runtime work, run validation/audit/IntegrationCheck, mutate source, or bypass ToolPolicyGate/human gates.

Phase 10T hardens that boundary at the run artifact layer. `src/workbench/codex-chat/bridge.ts` may label `chat.ask` / `orchestrator.plan` prompt stacks and `context.prepared` events with the packet/policy ids that were already accepted by `src/goal-loop/` and `src/workbench/codex-chat/goal-loop-context.ts`. It must not make freshness decisions, execute recommendations, alter confirmation queues, add worker prompt context, or turn prompt evidence into authority.

Phase 12H extends the same run artifact boundary for controlled-loop state. `src/workbench/codex-chat/context.ts` may derive compact prompt evidence from `VisibleGoalLoopMainAgentContextSection.controlledLoopState`, and `src/workbench/codex-chat/bridge.ts` may write that compact evidence to `promptStack` / `context.prepared`. It must not copy the full scheduler-loop snapshot, legal-action scope, recommended-action scope, markdown, artifact snapshots, or Workbench action payload material, and it must not make freshness decisions or execute recommendations.

Phase 10U adds the guided gate handoff boundary. `src/goal-loop/main-agent-context.ts` owns the text and metadata that describe the matching concrete Harness gate to the main Agent. Workbench chat/orchestrator code may record those refs in prompt artifacts, but must not generate actions from them, change queue priority, confirm gates, call action handlers, start scheduler workers, run validation/audit/IntegrationCheck, mutate source, or weaken ToolPolicyGate/human confirmation.

Phase 10V adds the Goal Loop gate-readiness preflight boundary. `src/goal-loop/` owns `GoalLoopGateReadinessPreflight` schema, paths, repository, rendering, and compilation. Workbench confirmation code may attach a secondary readiness action to an already-visible concrete gate, and server/action glue may pass the current gate snapshot for validation. Those layers must not own preflight policy, execute the concrete gate, pre-authorize ToolPolicyGate, generate duplicate primary confirmations, start scheduler/runtime work, mutate source, or weaken the concrete gate's stale-target revalidation and human confirmation.

Phase 10W adds the Goal Loop-assisted concrete gate confirmation boundary. A preflight id may be attached only to the matching concrete Workbench action. The concrete action type remains the executable transition, ToolPolicy target, stale revalidation target, and handler path. `src/workbench/actions/goal-loop-gate-confirmation.ts` owns assisted confirmation guard logic; server/action/projection modules may only call it or pass payload fields. Goal Loop modules and handlers must not dispatch concrete actions, and no `planning.goal-loop.*` wrapper action may invoke a concrete Harness gate.

Phase 10X adds the Goal Loop accepted-artifact freshness boundary. `src/goal-loop/` owns accepted artifact hash evidence for `spec.md`, `plan.md`, `tasks.md`, and `ac-map.json`, and owns packet freshness comparison against those hashes. Workbench, prompt-context, controller, preflight, and assisted gate modules may call the freshness helper, but must not reimplement hash policy, treat stale packets as current guidance, or use accepted artifact hashes as execution authority. The boundary remains evidence-only and does not add source mutation, scheduler execution, apply/close/merge, or child Change behavior.

Phase 11I adds the scheduler execution-mode evidence boundary. `src/workflow-scheduler/` owns `SchedulerExecutionModeAssessment` terminology and classification; `src/goal-loop/` may persist and render that assessment in decisions, iterations, briefs, packets, and main-Agent context. The assessment is non-executing evidence with `loopAuthorized: false`, `fullParallelExecutorAuthorized: false`, `wholeWaveDispatchAuthorized: false`, and `slotAllocatorAuthorized: false`. It may explain that the current scheduler path remains a single separate human-gated transition, terminal close-gate state, blocked/waiting state, or waiting-for-evidence state, but it must not create actions, prioritize confirmation queues, start workers, dispatch waves, allocate slots, run validation/audit/IntegrationCheck, mutate source, apply, close, merge, or authorize a scheduler loop/full executor.

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
Project -> Conversation window
Project -> Harness Change / Workpad -> Run -> Events / Artifacts
```

Decisions:

- Users should see projects and demand conversations, not internal Topic/Change/Workpad terminology.
- A Workbench conversation is not a Change identity. It may reference workflow
  metadata when a real Harness flow exists, but write-capable actions must carry
  explicit Change scope.
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
