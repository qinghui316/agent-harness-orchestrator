# Agent Development OS

## 1. Purpose

AHO is a local-first Agent Development OS with a Spec-Anchored Harness Kernel. Its final product shape is not a ticket board, not a generic multi-agent framework, and not a pure chat UI. It is a developer control system where natural-language work appears to users as project-scoped demand conversations while becoming durable internal Change, Workpad, TaskGraph, execution evidence, validation, audit, and human decisions.

This document is the high-level reading bridge between `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/WORKBENCH.md`, and `docs/AGENT-MODEL.md`.

## 2. Final Product Loop

The long-term product loop is:

```text
Natural-language demand
-> Demand conversation
-> Intake / Project Scan
-> Clarification
-> Main planning-agent proposal
-> Spec / Design / Tasks / AC artifacts
-> Human confirm execution
-> TaskGraph
-> Coding Work Package
-> TaskRun Queue
-> WorkerLease dispatch
-> Per-task worktree
-> Per-task validation
-> Per-task audit
-> Integration worktree
-> Aggregate validation
-> Aggregate audit
-> Human apply / merge
-> Integration failure or conflict
-> IntegrationFix TaskRun
-> Re-validation / re-audit
-> Close / archive
-> Harness evolution
```

The user should not need to know ECL, Change, Workpad, Topic, TaskRun, WorkerLease, or queue terms before asking for work. The demand conversation should explain the current understanding, the accepted state, agent progress, strongest evidence, and next safe decision. Workpad remains the internal read model that supports that conversation.

OpenSpec is the planning reference for this part of the loop. AHO should use one main planning-agent conversation to refine the user's demand and produce proposal/spec/design/tasks/AC artifacts, rather than exposing separate spec and planner agents as mandatory user-facing steps. The artifact split remains important internally; the user interaction should stay conversational.

## 3. Historical Baseline Note

This section preserves the Phase 7F-era product baseline as historical architecture context. It is not the current implementation baseline. For the current post-Phase-10T baseline and next recommended development direction, read `docs/CURRENT-DEVELOPMENT-PLAN.md` and `docs/STATUS.md`.

Historical baseline through Phase 7F:

- Workbench is conversation-first for users and Change/Workpad-backed internally.
- Intake can perform read-only scan and deterministic clarification before Spec.
- Spec, Plan, Tasks, AC, validation, audit, apply/close, and archive remain canonical ECL-backed workflow concepts.
- TaskGraph is derived from accepted `tasks.md` / `ac-map.json`.
- TaskRun records one task execution attempt.
- WorkerLease records local runtime ownership.
- Task-scoped Coder, Validation, and Audit evidence can be projected into Workpad.
- TaskRun retry and reconcile exist for single-task attempts.
- TaskRun Queue can run accepted tasks sequentially and stop on blockers.
- Decision Inspector aligns the current Workpad blocker/proposal with the right-side human gate.
- Coding Work Package makes the normal implementation grain explicit: one demand maps to one Change/Workpad, one implementation package, and one `coder-agent` by default.
- TaskGraph remains the checklist/evidence/progress structure and future split-analysis substrate rather than the default coder assignment boundary.
- Multiple independent demands can be projected as separate Workpads with scoped Thread, Agent Loop, Decision Inspector, evidence, and memory namespace.
- Workpad memory is explicitly separated into `project/stable`, `change/{changeId}`, `run/{runId}`, and `agent/{roleId}/session/{sessionId}` boundaries.
- User Decision Layer / Auto Workpad Finalization simplifies the main user actions to confirm execution, request changes, abandon, and confirm apply/merge.
- Main Planning Agent + Role Pipeline v1 lets one demand conversation produce planning artifacts, run the default coder/validator/auditor evidence path locally, and return results to the main conversation.
- Codex-style Project Conversation Sidebar shows projects as folders and nested demand conversations.
- Conversation-first docs/UI alignment keeps primary user language on projects, demand conversations, plans, execution, results, evidence, and apply/merge decisions.
- Codex app-server adapter v1 adds optional steer/interrupt support for planning-agent and coder-agent turns, with `codex exec` fallback.
- Result Review + Apply Handoff v1 lets users review worktree diff, validation/audit evidence, notes, and apply readiness before applying or discarding a local result.
- Main Agent AgentTaskRepository + Background Maintenance Candidate Pipeline v1 records foreground role tasks and advisory background maintenance candidates.
- Main Orchestrator + Demand Worker Queue v1 routes confirmed demands through a local demand-level worker queue.
- Parent-Agent Conversation Surface keeps TaskRepository, maintenance, diagnostics, and raw evidence behind details so the default surface is the main demand conversation.
- Bounded Demand Worker Slots + Local Orchestrator Pump v1 lets multiple independent demand conversations run concurrently, each with its own worktree, role evidence, and result review.
- Scoped Apply Readiness + Source Refresh Rework v1 keeps apply/discard scoped to an explicit demand result and turns source drift into a fresh same-demand rework attempt.
- Conversation-first Confirmation Queue + Integration Check Tool Result v1 checks multiple ready demand results in a temporary integration worktree before a user-confirmed source-root apply.
- IntegrationFix Agent + Local Merge Readiness Foundation v1 adds aggregate validation/audit and one bounded integration-layer repair attempt for failed combined-result checks before source-root apply.
- Local Landing Readiness Package + Merge Reviewer v1 adds a post-apply local landing package and read-only merge-reviewer verdict before any future commit/PR handoff.
- PR Draft Adapter v1 + Remote Handoff Boundary creates or updates a GitHub Draft PR after landing review passes and the user confirms.
- Main-Agent PR Feedback Orchestration + Draft PR Update v1 reads GitHub PR feedback/checks as remote evidence, classifies the feedback in the parent-agent loop, routes actionable feedback into same-demand rework, and updates the same Draft PR branch only after another user confirmation.
- PR Human Review Handoff + Ready-for-Review State v1 refreshes Draft PR feedback/check readiness, exposes a `提交人工评审` confirmation only when no actionable feedback or failed checks remain, and may mark the Draft PR ready for review after user confirmation.
- Thread-aware PR Review Feedback + Same-demand Rework Handoff reads reviews, checks, top-level comments, inline review comments, and provider thread capability; records user review-stage feedback into the same demand context; routes actionable feedback into same-demand rework; and supports user-confirmed review replies / thread resolution without merge or land.
- Change Memory Consolidation + Doc Drift Budget Guard v1 records terminal-demand closeouts, refreshes generated maintenance indexes/cache, runs a five-terminal-change maintenance review, scores/reviews reusable lesson and doc drift candidates, enforces doc budget guardrails, and keeps maintenance memory out of ordinary role-agent context.
- User-confirmed Remote Landing + Post-merge Memory Boundary v1 may prepare remote PR landing readiness, show `合并 PR` only when provider/check/review state allows it, perform a user-confirmed GitHub CLI squash merge, and record a merged closeout plus maintenance ledger/index evidence.
- Post-Merge Reconcile + Safe Local Sync / Branch Cleanup v1 consumes a merged remote landing result, explains local/remote state, and may offer safe fast-forward local sync or remote PR head branch cleanup only after explicit checks and user confirmation.
- Remote Landing Queue + Landing Policy v1 builds a project-level landing queue from explicit PR handoff targets, refreshes each candidate through existing remote landing readiness, and merges at most one PR per user confirmation.
- Main Conversation + Demand Agent Run Graph v1 keeps the center surface focused on one parent-agent conversation and one read-only graph per selected demand.
- Codex-style Parent-Agent Transcript + Inline Agent Run Graph Tabs makes `center.parentAgentTranscript.items` the main conversation projection and keeps the run graph structural.
- MCP DelegateTask Tool + Main-Agent Process Transcript v1 adds a controlled `delegateTask` contract, honest MCP capability labeling, worker non-delegation boundaries, AgentTask lifecycle evidence, and visible process rows in the main transcript.
- Main-Agent Tool Orchestration + Runtime Boundary Enforcement v1 makes foreground role execution pass through main-agent decisions, ToolPolicyGate, RoleDispatcher, AgentTaskResult, ToolEventAudit, and PostRunBoundaryAudit.
- Codex Runtime Transcript Cells v1 and Codex/Open Design Transcript Renderer Alignment make runtime/replay cells the only default conversation renderer input.
- Workbench Snapshot Layered Loading keeps first-screen snapshots lightweight while heavy transcript, graph, detail, evidence, maintenance, and landing queue views load as scoped lazy projections.
- Change Target Binding Foundation lets runnable and closeable entrypoints use explicit active demand targets while preserving legacy single-active fallback for CLI-compatible paths.
- Role Context Packet / A2A Context Projection gives core worker runs scoped, auditable `context-packet.json` and `context.md` artifacts instead of parent chat or full Harness injection.
- MainAgent Orchestration Decision Engine v1 moves the default coder/validator/auditor/rework policy into evidence-derived `MainAgentOrchestrationDecisionEngine` decisions.

At that point, the baseline was demand-level bounded concurrency with source-safe scoped result application, local integration checks, local integration-layer repair, local landing-readiness evidence, a user-confirmed Draft PR handoff, a user-confirmed Draft PR feedback/update loop, a user-confirmed ready-for-review handoff, thread-aware review-feedback rework/reply handoff, background memory consolidation/doc drift guardrails, a user-confirmed remote merge boundary, safe post-merge reconcile/cleanup, a narrow operator-confirmed landing queue, parent-agent transcript tabs, a read-only demand agent run graph, controlled delegateTask process rows, role context packet artifacts, and an evidence-derived default main-agent orchestration decision engine. This historical note does not supersede current Goal Loop, scheduler, or Harness evolution boundaries in `docs/CURRENT-DEVELOPMENT-PLAN.md`.

## 4. Historical Phase 7H Direction

This section preserves the Phase 7H decomposition direction as historical roadmap context. It is not the active next product direction. The active plan-level direction is in `docs/CURRENT-DEVELOPMENT-PLAN.md`.

Phase 7H started the next product direction after Phase 7F without replacing Harness with a generic workflow runtime. It let the main agent propose a durable DecompositionPlan for complex demands while preserving the then-current default implementation grain:

```text
one independent demand conversation
-> one internal Change/Workpad
-> one Coding Work Package
-> one coder-agent
-> one AHO-owned worktree
```

Phase 7F handles the first boundary and orchestration step after `delegateTask` became visible in the transcript. Foreground role execution now records role steps and asks `MainAgentOrchestrationDecisionEngine` for the next default coder/validator/auditor/rework decision. The default role order can still be recommended, but each role run must be traceable as `MainAgentDecision -> DelegateTaskRequest -> ToolPolicyDecision -> AgentTask -> RoleDispatcher -> AgentTaskResult -> next MainAgentDecision`.

Phase 7H DecompositionPlan work sits above that decision engine as a proposal boundary. The main agent may classify a complex demand as single-Change, multi-task-in-one-Change, multi-Change candidate, or needs clarification; describe child tasks, dependencies, file/module scope, AC coverage, pipeline/barrier relationships, role runs, synthesis evidence, and recovery boundaries; then ask the user to confirm the proposal. Confirmation does not create child Changes, TaskGraph execution units, or AgentTasks. Phase 7I adds `DecompositionReadinessManifest` as a machine-checkable guardrail verdict over a confirmed plan. Phase 7J makes that verdict enforceable before code-producing execution: direct `code.run` is allowed only for single-change readiness, and sequential taskgraph readiness must produce a typed TaskQueueProposal and receive separate user confirmation before queue records are created. It still must not directly mutate source, canonical docs, ECL, apply, merge, close, archive, Harness evolution state, or scheduler state.

Open Dynamic Workflows is the reference for deterministic workflow-as-artifact, schema-shaped leaf `agent()` output, `pipeline()` versus `parallel()` semantics, phase/agent/run events, and journal-backed recovery. AHO should borrow those mechanics as a future internal runtime pattern, not as the product authority model.

WorkflowRun recovery is scoped execution recovery. It may reuse completed leaf results only when the WorkflowPlan, Change, TaskGraph node ids, role spec, context packet hash, accepted planning artifacts, source revision, worktree base, and policy profile still match. Stale context, source drift, policy drift, missing journal records, or failed isolation must fail closed and rerun or stop for user input. Reused results still require synthesis, validation, audit, and human confirmation.

The later roadmap options below remain useful as staged product ideas, but they are candidates rather than current implemented behavior or current next-step instructions. Before selecting any next phase, reconcile them with `docs/CURRENT-DEVELOPMENT-PLAN.md`, the latest archived `summary.md`, and the relevant architecture/runtime/workbench docs.

## 5. Later Staged Roadmap

### TaskGraph Dependency And Conflict Model

Before safe parallelism, AHO needs task metadata that says which tasks can run together:

- dependencies;
- file/module scope;
- AC scope;
- conflict groups;
- required artifacts;
- expected validation signals.

### Parallel Worktree Scheduler

After TaskGraph can classify independent tasks, AHO can dispatch multiple TaskRuns with multiple WorkerLeases. Each worker owns one scoped worktree/session attempt. Parallel work is still proposal-only until validation, audit, and human gates complete.

### Integration Worktree

Parallel task worktrees should not merge directly into the source tree. AHO should first create an integration worktree that combines accepted task proposals. The integration worktree is itself a proposal and evidence source.

### Aggregate Validation And Audit

Per-task validation/audit proves each task in isolation. Integration validation/audit proves the combined result:

- aggregate validation checks the integrated worktree mechanically;
- aggregate audit checks semantic consistency, spec alignment, test coverage, and risk;
- both are evidence, not final authority.

### IntegrationFix TaskRun

If integration merge conflicts, aggregate validation fails, or aggregate audit blocks, AHO should create an IntegrationFix TaskRun. This agent receives conflict artifacts, failed validation/audit evidence, and integration worktree context, then proposes a repair. It still requires re-validation, re-audit, and human confirmation.

### Human Apply / Merge

Human confirmation remains the final gate before source apply/merge. AHO may prepare a merge attempt, readiness review, and evidence package, but agent review cannot merge by itself.

### Local Landing Readiness Package

Before remote PR/merge exists, AHO needs a local proof bundle for applied results:

- explicit applied result targets;
- source diff after apply;
- changed files and unattributed dirty-source detection;
- apply record and validation/audit or aggregate evidence;
- IntegrationFix evidence when a repaired integration artifact was applied;
- merge-reviewer verdict and risks.

This package gives the future PR/provider adapter a stable input while keeping Phase 6N local-only.

### Codex App-Server Bridge

Codex app-server is a later runtime bridge for richer Workbench sessions, live tool state, continuation, and future request-user-input synchronization. It must not become workflow truth.

### Agent Activity Visualization

Agent activity map / animation is a derived Workbench view over TaskRun, WorkerLease, AgentSession, run events, validation, audit, blockers, and decisions. It is not a scheduler and not truth.

## 6. Documentation And Architecture Evolution

AHO itself should eventually maintain its product docs through constrained agents:

- Documentation Agent detects stale docs, broken reading paths, and reference drift.
- Architecture Agent checks consistency between product goals, architecture, runtime objects, and Workbench behavior.
- Evolution Agent turns archived evidence into Harness/process proposals.
- Evolution Scorer rates candidate value, evidence, safety, and implementation readiness.
- Evolution Reviewer recommends accept, defer, or reject based on evidence and current product direction.

These agents output findings, proposals, and reviews. They do not directly rewrite canonical docs without human-gated acceptance.

AHO should borrow AgentScope Java's two-layer background maintenance structure:

```text
append-only maintenance ledger
-> background candidate extraction
-> curated candidate
-> scoring
-> review
-> human-gated canonical update
```

The current external `ecl-harness-engineer` skill and fixed archive-threshold evolution remain useful compatibility mechanisms, but they are not the final AHO product mechanism for long-term product documentation consistency.

## 7. Boundaries

- AHO is not a Linear clone.
- AHO is not a generic in-process multi-agent framework.
- AHO is not a pure chat UI.
- AHO does not make demand conversations, Workpad, SQLite, TaskQueue views, or animation workflow truth.
- MVP does not automatically merge to main.
- Long-term merge/integration support must remain human-gated.
- Reference projects provide evidence and patterns, not architecture to copy verbatim.
