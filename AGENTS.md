# Agent Harness Orchestrator Agent Guide

Agent Harness Orchestrator (AHO) is a local-first Agent Development OS with a Spec-Anchored Harness Kernel. It lets a developer describe work in natural language, keeps the user experience centered on project-scoped demand conversations, binds each demand to durable internal Change/Workpad/TaskGraph state, runs constrained agents in isolated execution contexts, and preserves evidence for validation, audit, human decisions, and Harness evolution.

## 1. Current Phase

The repository is in the Workbench and product-definition track.

Current baseline:

- Phase 5U completed TaskRun / WorkerLease orchestration v1.
- Phase 5V-Docs completed and is archived at `harness/changes/archive/20260525-phase-5v-docs-agent-os-roadmap/summary.md`.
- Phase 5W completed local sequential TaskRun Queue / Local Orchestrator v1 and is archived at `harness/changes/archive/20260525-phase-5w-taskrun-queue-local-orchestrator/summary.md`.
- Phase 5X completed Current Decision Inspector and Rework Handoff v1 and is archived at `harness/changes/archive/20260525-phase-5x-current-decision-inspector-rework-handoff/summary.md`.
- Phase 5Y completed Coding Work Package semantics and is archived at `harness/changes/archive/20260525-phase-5y-coding-work-package-read-model/summary.md`.
- Phase 5Z completed Multi-Workpad concurrency projection and memory isolation v1 and is archived at `harness/changes/archive/20260525-phase-5z-multi-workpad-concurrency-memory-isolation/summary.md`.
- Phase 6A completed User Decision Layer + Auto Workpad Finalization and is archived at `harness/changes/archive/20260526-phase-6a-user-decision-layer-auto-workpad-finalization/summary.md`.
- Phase 6B-Prep added OpenSpec as a planning reference and is archived at `harness/changes/archive/20260526-phase-6b-prep-openspec-reference-docs/summary.md`.
- Phase 6B completed Main Planning Agent + Role Prompt Pack + Local Role Pipeline and is archived at `harness/changes/archive/20260526-phase-6b-main-planning-agent-role-pipeline/summary.md`.
- Phase 6C completed Codex-style Project Conversation Sidebar and is archived at `harness/changes/archive/20260526-phase-6c-codex-style-project-conversation-sidebar/summary.md`.
- Phase 6D completed Conversation-first docs/UI alignment and is archived at `harness/changes/archive/20260526-phase-6d-conversation-first-docs-ui-alignment/summary.md`.
- Phase 6E completed Codex App-Server Adapter v1 + Planning/Coder Steering and is archived at `harness/changes/archive/20260526-phase-6e-codex-app-server-adapter-v1/summary.md`.
- Phase 6F completed Codex-style Result Review + Apply Handoff v1 and is archived at `harness/changes/archive/20260526-phase-6f-result-review-apply-handoff/summary.md`.
- Phase 6G-Prep completed Harness docs / AgentTaskRepository / background evolution alignment and is archived at `harness/changes/archive/20260527-phase-6g-prep-harness-docs-agent-task-evolution-alignment/summary.md`.
- Phase 6G completed Main Agent AgentTaskRepository + Background Maintenance Candidate Pipeline v1 and is archived at `harness/changes/archive/20260527-phase-6g-main-agent-task-repository-background-evolution/summary.md`.
- Phase 6H completed Main Orchestrator + Demand Worker Queue v1 and is archived at `harness/changes/archive/20260528-phase-6h-main-orchestrator-demand-worker-queue/summary.md`.
- Phase 6I completed Parent-Agent Conversation Surface + AgentScope-style Tool Result Boundaries and is archived at `harness/changes/archive/20260528-phase-6i-parent-agent-conversation-surface/summary.md`.
- Phase 6J completed Bounded Demand Worker Slots + Local Orchestrator Pump v1 and is archived at `harness/changes/archive/20260528-phase-6j-bounded-demand-worker-slots-orchestrator-pump/summary.md`.
- Phase 6K completed Scoped Apply Readiness + Source Refresh Rework v1 and is archived at `harness/changes/archive/20260528-phase-6k-scoped-apply-readiness-source-refresh-rework/summary.md`.
- Phase 6L completed Conversation-first Confirmation Queue + Integration Check Tool Result v1 and is archived at `harness/changes/archive/20260528-phase-6l-conversation-first-confirmation-queue-integration-check/summary.md`.
- Phase 6M completed IntegrationFix Agent + Local Merge Readiness Foundation and is archived at `harness/changes/archive/20260529-phase-6m-integrationfix-agent-local-merge-readiness-foundation/summary.md`.
- Phase 6N completed Local Landing Readiness Package + Merge Reviewer v1 and is archived at `harness/changes/archive/20260529-phase-6n-local-landing-readiness-package-merge-reviewer/summary.md`.
- Phase 6O completed PR Draft Adapter v1 + Remote Handoff Boundary and is archived at `harness/changes/archive/20260529-phase-6o-pr-draft-adapter-remote-handoff/summary.md`.
- Phase 6P completed Main-Agent PR Feedback Orchestration + Draft PR Update v1 and is archived at `harness/changes/archive/20260529-phase-6p-main-agent-pr-feedback-orchestration-draft-update/summary.md`.
- Phase 6Q completed PR Human Review Handoff + Ready-for-Review State v1 and is archived at `harness/changes/archive/20260529-phase-6q-pr-human-review-handoff-ready-state/summary.md`.
- Phase 6R completed Thread-aware PR Review Feedback + Same-demand Rework Handoff and is archived at `harness/changes/archive/20260529-phase-6r-thread-aware-pr-review-feedback-rework-handoff/summary.md`.
- Phase 6S completed Change Memory Consolidation + Doc Drift Budget Guard v1 and is archived at `harness/changes/archive/20260530-phase-6s-change-memory-consolidation-doc-drift-budget-guard/summary.md`.
- Phase 6T completed User-confirmed Remote Landing + Post-merge Memory Boundary v1 and is archived at `harness/changes/archive/20260530-phase-6t-user-confirmed-remote-landing-post-merge-memory-boundary/summary.md`.
- Phase 6U completed Post-Merge Reconcile + Safe Local Sync / Branch Cleanup v1 and is archived at `harness/changes/archive/20260530-phase-6u-post-merge-reconcile-safe-sync-cleanup/summary.md`.
- Phase 6V completed Remote Landing Queue + Landing Policy v1 and is archived at `harness/changes/archive/20260530-phase-6v-remote-landing-queue-policy-v1/summary.md`.
- Harness evolution after Phase 6L completed and is archived at `harness/changes/archive/20260528-auto-evolve-harness-phase-6l-terminal-tool-result-coverage/summary.md`.
- Harness evolution after Phase 6G completed and is archived at `harness/changes/archive/20260527-auto-evolve-harness-phase-6g-real-acceptance-feedback/summary.md`.
- Harness evolution after Phase 6D completed as noop and is archived at `harness/changes/archive/20260526-auto-evolve-harness-phase-6d/summary.md`.
- Harness evolution after Phase 6T completed as noop/defer and is archived at `harness/changes/archive/20260530-auto-evolve-harness-phase-6p-6t/summary.md`.
- Phase 6W completed Main Conversation + Demand Agent Run Graph v1 and is archived at `harness/changes/archive/20260530-phase-6w-main-conversation-demand-agent-run-graph/summary.md`.
- Phase 6X completed Codex-style Parent-Agent Transcript + Inline Agent Run Graph Tabs and is archived at `harness/changes/archive/20260530-phase-6x-parent-agent-transcript-inline-run-graph-tabs/summary.md`.
- Harness evolution after Phase 6X promoted scoped Workbench action payload coverage and is archived at `harness/changes/archive/20260530-auto-evolve-harness-phase-6t-6x/summary.md`.
- Phase 6Y completed MCP DelegateTask Tool + Main-Agent Process Transcript v1 and is archived at `harness/changes/archive/20260530-phase-6y-mcp-delegatetask-tool-main-agent-transcript-events/summary.md`.
- Phase 6Z completed Main-Agent Tool Orchestration + Runtime Boundary Enforcement v1 and is archived at `harness/changes/archive/20260531-phase-6z-main-agent-tool-orchestration-runtime-boundary-enforcement/summary.md`.
- Phase 7A completed Codex Runtime Transcript Cells v1 and is archived at `harness/changes/archive/20260531-phase-7a-codex-runtime-transcript-cells/summary.md`.
- Phase 7B completed Codex/Open Design Transcript Renderer Alignment and is archived at `harness/changes/archive/20260531-phase-7b-codex-open-design-transcript-renderer-alignment/summary.md`.
- Phase 7C completed Workbench Snapshot Layered Loading and is archived at `harness/changes/archive/20260531-phase-7c-workbench-snapshot-layered-loading/summary.md`.
- Phase 7D completed Change Target Binding Foundation and is archived at `harness/changes/archive/20260531-phase-7d-change-target-binding-foundation/summary.md`.
- Phase 7E completed Role Context Packet / A2A Context Projection and is archived at `harness/changes/archive/20260531-phase-7e-role-context-packet-a2a-projection/summary.md`.
- Phase 7F completed MainAgent Orchestration Decision Engine v1 and is archived at `harness/changes/archive/20260531-phase-7f-mainagent-orchestration-decision-engine/summary.md`.
- Phase 7G completed Open Dynamic Workflows Reference Alignment and is archived at `harness/changes/archive/20260602-phase-7g-open-dynamic-workflows-reference-alignment/summary.md`.
- Phase 7H completed Doc Drift and Scoped DecompositionPlan Boundary and is archived at `harness/changes/archive/20260602-phase-7h-doc-drift-and-scoped-decompositionplan-boundary/summary.md`.
- Phase 7I completed Decomposition Readiness Manifest and is archived at `harness/changes/archive/20260605-phase-7i-decomposition-readiness-manifest/summary.md`.
- Phase 7J completed Strict Harness-Gated Execution Path and is archived at `harness/changes/archive/20260605-phase-7j-strict-harness-gated-execution-path/summary.md`.
- Phase 7K completed WorkflowRun Journal and Recoverable TaskQueue and is archived at `harness/changes/archive/20260606-phase-7k-workflowrun-journal-and-recoverable-taskqueue/summary.md`.
- Phase 7L completed Modular Versioned WorkflowGraphPlan Boundary and is archived at `harness/changes/archive/20260606-phase-7l-modular-versioned-workflowgraphplan-boundary/summary.md`.
- Phase 7M completed Scoped Boundary Fixes and Workbench Runtime Modularization and is archived at `harness/changes/archive/20260607-phase-7m-scoped-boundary-fixes-and-workbench-runtime-modularization/summary.md`.
- Harness evolution after Phase 7M promoted module-boundary and handoff-drift coverage and is archived at `harness/changes/archive/20260607-auto-evolve-harness-phase-7i-7m-runtime-modular-boundary/summary.md`.
- Phase 7N completed Workbench Runtime Large File Boundary Split and is archived at `harness/changes/archive/20260608-phase-7n-workbench-runtime-large-file-boundary-split/summary.md`.
- Phase 7O completed Workbench Server Projection UI Boundary Split and is archived at `harness/changes/archive/20260608-phase-7o-workbench-server-projection-ui-boundary-split/summary.md`.
- Phase 7P completed Action Execution Runtime Kernel Boundary Split and is archived at `harness/changes/archive/20260608-phase-7p-action-execution-runtime-kernel-boundary-split/summary.md`.
- Phase 7Q completed Workbench Read Model UI Boundary Split and is archived at `harness/changes/archive/20260608-phase-7q-workbench-read-model-ui-boundary-split/summary.md`.
- Harness evolution after Phase 7Q promoted module handoff map coverage and is archived at `harness/changes/archive/20260608-auto-evolve-harness-phase-7m-7q-modular-boundary/summary.md`.
- Phase 7R completed Workbench Projection Builder Boundary Split and is archived at `harness/changes/archive/20260608-phase-7r-workbench-projection-builder-boundary-split/summary.md`.
- Phase 7S completed Workbench Chat Boundary Split and is archived at `harness/changes/archive/20260609-phase-7s-workbench-chat-boundary-split/summary.md`.
- Phase 7T completed Workbench Frontend Surface Boundary Split and is archived at `harness/changes/archive/20260609-phase-7t-workbench-frontend-surface-boundary-split/summary.md`.
- Phase 7U completed Workflow Runtime Kernel Boundary Split and is archived at `harness/changes/archive/20260609-phase-7u-workflow-runtime-kernel-boundary-split/summary.md`.
- Harness evolution after Phase 7U completed as noop and is archived at `harness/changes/archive/20260609-auto-evolve-harness-phase-7q-7u-runtime-boundary/summary.md`. Authorized subagent review recommended `noop` with score `88/100`; existing module handoff map coverage was sufficient for the Phase 7Q-7U modularization window.
- Harness evolution after Phase 7E completed as noop and is archived at `harness/changes/archive/20260531-auto-evolve-harness-phase-7a-7e-context-boundary/summary.md`.
- Harness evolution after Phase 7I promoted proposal/runtime boundary coverage and is archived at `harness/changes/archive/20260605-auto-evolve-harness-phase-7e-7i/summary.md`.
- Agent Orchestration Harness Decoupling Docs completed and is archived at `harness/changes/archive/20260531-agent-orchestration-harness-decoupling-docs/summary.md`.
- Phase 7V completed Workbench Read Model Confirmation Queue Boundary Split and is archived at `harness/changes/archive/20260609-phase-7v-workbench-read-model-confirmation-queue-boundary-split/summary.md`.
- Phase 7W completed Workbench Server API Boundary Split and is archived at `harness/changes/archive/20260609-phase-7w-workbench-server-api-boundary-split/summary.md`.
- Phase 7X completed Workbench Read Model Residual Split and is archived at `harness/changes/archive/20260609-phase-7x-workbench-read-model-residual-split/summary.md`.
- Phase 7Y completed Workbench Frontend Residual Surface Split and is archived at `harness/changes/archive/20260609-phase-7y-workbench-frontend-residual-surface-split/summary.md`.
- Phase 7Z completed CLI Command Type Barrel Boundary Split and is archived at `harness/changes/archive/20260609-phase-7z-cli-command-type-barrel-boundary-split/summary.md`.
- Phase 8A completed AgentTask Maintenance Domain Boundary Split and is archived at `harness/changes/archive/20260609-phase-8a-agenttask-maintenance-domain-boundary-split/summary.md`.
- Phase 8B completed Scoped Change Proposal Boundary Split and is archived at `harness/changes/archive/20260609-phase-8b-scoped-change-proposal-boundary-split/summary.md`.
- Phase 8C completed Code Execution Manager Boundary Split and is archived at `harness/changes/archive/20260609-phase-8c-code-execution-manager-boundary-split/summary.md`.
- Harness evolution after Phase 8C completed as noop and is archived at `harness/changes/archive/20260609-auto-evolve-harness-phase-7y-8c-modular-boundary/summary.md`. Authorized subagent review recommended `noop` with score `90/100`; existing module-boundary, handoff-drift, scoped action payload, and proposal/runtime boundary rules were sufficient for the Phase 7Y-8C window.
- Phase 8D completed Scoped Integration Check Boundary Split and is archived at `harness/changes/archive/20260609-phase-8d-scoped-integration-check-boundary-split/summary.md`.
- Phase 8E completed Remote Handoff PR Landing Boundary Split and is archived at `harness/changes/archive/20260609-phase-8e-remote-handoff-pr-landing-boundary-split/summary.md`.
- Phase 8F completed Apply Landing PR Draft Boundary Split and is archived at `harness/changes/archive/20260609-phase-8f-apply-landing-pr-draft-boundary-split/summary.md`.
- Phase 8G completed Scoped Spec-Test Evidence Boundary Split and is archived at `harness/changes/archive/20260610-phase-8g-scoped-spec-test-evidence-boundary-split/summary.md`.
- Phase 8H completed Strict TaskQueue Domain Boundary Split and is archived at `harness/changes/archive/20260610-phase-8h-strict-taskqueue-domain-boundary-split/summary.md`.
- Phase 8I completed DemandWorker Domain Boundary Split and is archived at `harness/changes/archive/20260610-phase-8i-demandworker-domain-boundary-split/summary.md`.
- Phase 8J completed Scoped TaskRun WorkerLease Boundary Split and is archived at `harness/changes/archive/20260610-phase-8j-scoped-taskrun-workerlease-boundary-split/summary.md`.
- Phase 8L completed Scoped WorkflowRun Boundary Split and is archived at `harness/changes/archive/20260610-phase-8l-scoped-workflowrun-boundary-split/summary.md`.
- Active change: `harness/changes/active/phase-8n-run-evidence-manager-boundary-split/summary.md`.
- Pending Harness evolution: none. The Phase 8G-8K window was marked complete as `noop/subagent_review` with subagent score `90/100`.
- Latest Harness evolution: `harness/changes/archive/20260610-auto-evolve-harness-phase-8g-8k-boundary-evidence/summary.md`, which completed the Phase 8G-8K pending window as `noop/subagent_review` with subagent score `90/100`.

Current baseline includes Codex app-server planning/coder turns, result review/apply handoff, foreground AgentTasks, advisory background maintenance ledger/candidate/score/review artifacts, bounded demand worker slots, scoped apply readiness/source refresh rework, parent-agent demand conversation surfaces, a confirmation queue with local integration checks, Phase 6M aggregate validation/audit plus bounded IntegrationFix before source-root apply, Phase 6N local landing readiness packages plus read-only merge-reviewer verdicts after source-root apply, Phase 6O GitHub CLI Draft PR handoff after landing review passes, Phase 6P main-agent PR feedback orchestration plus same-Draft-PR branch updates after user confirmation, Phase 6Q ready-for-review handoff, Phase 6R thread-aware review feedback/reply handoff, Phase 6S demand memory closeouts, five-terminal-change maintenance reviews, doc drift/budget guardrails, role-scoped context projection for maintenance memory, Phase 6T user-confirmed remote PR landing plus post-merge memory boundaries, Phase 6U post-merge reconcile with optional safe local fast-forward sync / remote PR head branch cleanup, Phase 6V project-level remote landing queues that refresh explicit PR candidates and merge at most one PR per user confirmation, Phase 6W demand agent run graph projection, Phase 6X Codex-style parent-agent transcript plus inline `对话 / Agent 运行图` tabs, Phase 6Y controlled `delegateTask` tool contract and process metadata, Phase 6Z main-agent tool orchestration with ToolPolicyGate / WorkerPermissionProfile / ToolEventAudit / PostRunBoundaryAudit, Phase 7A Codex-equivalent runtime transcript cells, Phase 7B Codex/Open Design transcript renderer alignment, Phase 7C lightweight Workbench snapshot shell plus scoped lazy loaders, Phase 7D ChangeTarget binding for runnable and closeable active demand targets, Phase 7E RoleContextPacket artifacts for core role-run A2A context, Phase 7F deterministic MainAgentOrchestrationDecisionEngine for default foreground role/rework choices, Phase 7G reference/docs alignment for Open Dynamic Workflows lessons, Phase 7H selected-demand/action-boundary fixes plus a proposal-only DecompositionPlan layer, Phase 7I non-executable DecompositionReadinessManifest guardrail checks for confirmed DecompositionPlan artifacts, Phase 7J strict typed execution gating plus TaskQueueProposal pre-execution artifacts, Phase 7K typed WorkflowRun journal/recovery evidence for sequential TaskQueue execution, Phase 7L versioned WorkflowGraphPlan execution input between TaskQueueProposal and WorkflowRun start, Phase 7M scoped workflow action/runtime modularization, Phase 7N Workbench/runtime large-file boundary split, Phase 7O Workbench server/projection/UI boundary split, Phase 7P action execution/runtime kernel boundary split, Phase 7Q Workbench read-model/UI boundary split, Phase 7R Workbench projection-builder boundary split, Phase 7S Workbench chat boundary split, Phase 7T Workbench frontend surface boundary split, Phase 7U workflow runtime kernel boundary split, Phase 7V read-model / confirmation queue boundary split, Phase 7W Workbench server/API boundary split, Phase 7X Workbench read-model residual split, Phase 7Y Workbench frontend residual surface split, Phase 7Z CLI command / type barrel boundary split, Phase 8A AgentTask / maintenance domain boundary split, Phase 8B scoped Change Proposal boundary split, Phase 8C code execution manager boundary split, Phase 8D scoped Integration Check boundary split, Phase 8E remote handoff / PR landing domain split, Phase 8F apply / landing / PR draft / landing queue boundary split, Phase 8G scoped Spec-Test evidence boundary split, Phase 8H strict TaskQueue typed-scope validation plus TaskQueue domain split, Phase 8I DemandWorker domain split, Phase 8J scoped TaskRun / WorkerLease evidence matching plus TaskRun domain split, Phase 8K scoped workflow artifact Change-scope guards plus workflow-artifacts domain split, Phase 8L WorkflowRun Change/queue/event scope guard plus workflow-run domain split, Phase 8M scoped Change lifecycle boundary split, and Phase 8N active Run evidence manager boundary split. The Phase 8G-8K Harness evolution window has been marked complete as `noop/subagent_review` with subagent score `90/100`; no new Harness rule was added. `TaskQueueProposal` remains a proposal artifact, `WorkflowGraphPlan` is versioned execution input, and `WorkflowRun` is runtime coordination/recovery evidence; none of them replace workflow truth. Run, Validation, Audit, DemandWorker, and TaskRun / WorkerLease remain bounded evidence or execution coordination records, not workflow truth. The default Workbench conversation renders only Codex runtime or `codex exec` replay cells, with command/tool/file details collapsed behind row details, while AHO orchestration/evidence records stay in graph/details/confirmation/evidence surfaces unless literally present in the Codex-visible transcript. Maintenance is project-level background evidence and must not be default selected-demand run graph or confirmation queue content. Executable WorkflowPlan JavaScript scripts, ODWF runtime integration, parallel scheduler, automatic child Change creation, landing skills, reviewer assignment, unattended automatic merge, unsafe local source rewrite, local branch deletion, true SubAgent chat, editable graph canvases, container sandbox, remote worker isolation, dynamic multi-Change project conversations, silent canonical memory/doc rewrites, and LLM output cache reuse remain future work. The user-facing product model remains project folders containing demand conversations. `Change`, `ChangeTarget`, `RoleContextPacket`, `MainAgentOrchestrationState`, `DecompositionPlan`, `DecompositionReadinessManifest`, `TaskQueueProposal`, `WorkflowGraphPlan`, `WorkflowRun`, `Workpad`, `Topic`, `TaskRun`, `WorkerLease`, queue state, TaskRepository, worker slot, claim, source drift, integration worktree, PR provider handles, remote landing provider state, post-merge git state, maintenance ledger, graph projection internals, policy/audit internals, and blocked/audit-blocked terms are internal or evidence-detail concepts unless a document explicitly discusses runtime architecture.

## 2. Context Loading Order

1. Read this `AGENTS.md`.
2. Read `docs/ECL.md`.
3. If `harness/changes/active/` contains a change, read its `summary.md`, `spec.md`, `plan.md`, and `tasks.md`.
4. If no active change exists and `harness/evolution/pending.md` exists, read it before `docs/STATUS.md`.
5. Read `docs/STATUS.md`.
6. Read `docs/PRODUCT.md`.
7. Read `docs/AGENT-DEVELOPMENT-OS.md`.
8. Read `docs/ARCHITECTURE.md`, `docs/RUNTIME.md`, `docs/WORKBENCH.md`, and `docs/AGENT-MODEL.md` as needed.
9. Read `docs/references/index.md` before using reference projects.

Archive history is loaded selectively through `docs/STATUS.md` paths or `harness/changes/INDEX.json`. Start with archived `summary.md` only.

## 3. Project Sources

| Document | Purpose |
| --- | --- |
| `docs/PRODUCT.md` | Product requirements, MVP boundaries, and final product shape |
| `docs/AGENT-DEVELOPMENT-OS.md` | End-to-end product loop and staged roadmap |
| `docs/ARCHITECTURE.md` | Architecture layers and major decisions |
| `docs/RUNTIME.md` | Runtime objects, facts, projections, and derived views |
| `docs/WORKBENCH.md` | Workbench information architecture and user interaction model |
| `docs/AGENT-MODEL.md` | Future role, subagent, worker, review, rework, and document-agent model |
| `docs/ECL.md` | Change lifecycle and Harness rules |
| `docs/DEVELOPMENT.md` | Local commands and verification |
| `docs/references/index.md` | Reference source maps and when to use each reference |

## 4. Work Classification

Small changes are local, low-risk edits such as typos, comments, or narrowly scoped documentation updates.

Structured changes include cross-file behavior, APIs, architecture, validation chains, Harness updates, reference source updates, or unclear requirements. Structured changes must use active change files.

If an active change exists, do not automatically keep using it. First decide whether the new work is close, park, or explicit same-scope extension:

- close: the active change is complete and verified;
- park: the active change is incomplete or waiting for acceptance and the user is switching topics;
- extend: the new request is a defect fix or acceptance supplement for the same active change.

For structured work, run or mentally apply `scripts/harness-change.ps1 preflight` before implementation. If extending, record the rationale, new/updated tasks, and verification in the active change before coding. Do not silently append unrelated phases to an old active change.

## 5. Structured Change Gate

Before implementation, structured work needs:

- `spec.md` for WHAT and WHY.
- `plan.md` for HOW and planning-discovered gaps.
- `tasks.md` for executable steps.
- `reviews/review.md` for independent review results.

High-impact unknowns must be recorded as `[NEEDS CLARIFICATION: ...]` and resolved before implementation.

## 6. Reference Projects

Reference source code is included as git submodules under `reference-projects/`.

| Reference | Use For | Local Path |
| --- | --- | --- |
| Agent Orchestrator | Worktrees, dashboard, runtime adapters, flat-file state | `reference-projects/agent-orchestrator/` |
| AgentScope Java | Workspace memory, session, subagent specs, task repository | `reference-projects/agentscope-java/` |
| Open Design | Local daemon, Web UI shell, readable tool/activity cards | `reference-projects/open-design/` |
| OpenAI Codex | `codex exec`, JSONL, app-server runtime boundary | `reference-projects/openai-codex/` |
| Open Dynamic Workflows | Deterministic workflow artifact, pipeline/barrier semantics, run events, recovery journal | `reference-projects/open-dynamic-workflows/` |
| OpenAI Symphony | Queue orchestration, worker lifecycle, Workpad, app-server sessions | `reference-projects/symphony/` |
| OpenSpec | Iterative demand clarification and proposal/spec/design/tasks artifact flow | `reference-projects/openspec/` |
| oh-my-codex | Role prompt files, command/skill organization, review roles | `reference-projects/oh-my-codex/` |
| ecl-harness-engineer | ECL/Harness protocol baseline | `reference-projects/ecl-harness-engineer/` |

Use `docs/design-docs/ref-*.md` as maps before reading reference source. Treat reference projects as evidence, not implementation instructions.

## 7. Current Verification

Run Harness verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check
```

Run product verification:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

## 8. Task-To-Artifact Map

| Task Type | Start Here | Expected Artifact |
| --- | --- | --- |
| Product requirement | `docs/PRODUCT.md` and `docs/AGENT-DEVELOPMENT-OS.md` | Updated spec or new active change |
| Architecture decision | `docs/ARCHITECTURE.md` | Decision note in `plan.md` |
| Runtime object decision | `docs/RUNTIME.md` | Runtime boundary note in `plan.md` |
| Workbench behavior | `docs/WORKBENCH.md` | Workbench spec or UI acceptance record |
| Agent/role/subagent model | `docs/AGENT-MODEL.md` | Role/spec proposal or architecture note |
| Harness rule change | `docs/ECL.md` | Structured change and lint update |
| Reference project research | `docs/references/index.md` | Updated `docs/design-docs/ref-*.md` |
| Current handoff | `docs/STATUS.md` | Resume or close active change |

## 9. Product Boundaries

AHO's workflow truth remains Change/ECL files, accepted Spec/Plan/Tasks/AC, TaskGraph, Run artifacts, Validation, Audit, Worktree state, Apply/Close decisions, and Harness evolution records.

Demand conversations are the primary user-facing work surface. Workpad, Thread, Agent Loop, TaskQueue views, AgentVisualState, SQLite, and animation are projections or coordination layers unless a later architecture decision explicitly promotes an object to source-of-truth status.

Human confirmation remains required before high-impact canonical transitions such as source apply/merge, close/archive, and Harness evolution apply. Agent audit and merge review are evidence, not final authority.

## 10. Reference Source Rules

Read reference maps before source, then inspect the relevant source/tests/config for the specific claim being made. Do not satisfy "look at reference projects" by concept mapping alone. Do not vendor-copy reference code into AHO product code. Reference updates are structured changes and must record the old commit, new commit, reason, implications, and verification.

Do not edit reference submodule source as part of this product repository. If local exploration changes a submodule, discard or isolate it in the submodule itself.

## 11. File Safety

- Preserve user changes. Do not revert unrelated edits.
- Use UTF-8 for source and documentation.
- PowerShell reads and writes must explicitly use UTF-8.
- Do not hand-edit `harness/changes/INDEX.json`; regenerate it with `scripts/harness-change.ps1 reindex`.
- Do not auto-apply Harness evolution from `pending.md`; use evidence, proposal, independent review, validation, and results logging.

## 12. Next Phase

Active change: `harness/changes/active/phase-8n-run-evidence-manager-boundary-split/summary.md`.

Pending Harness evolution: none. The Phase 8G through Phase 8K window was marked complete as `noop/subagent_review` with subagent score `90/100`.

Latest completed product-code phase: Phase 7F MainAgent Orchestration Decision Engine v1, archived at `harness/changes/archive/20260531-phase-7f-mainagent-orchestration-decision-engine/summary.md`.

Latest completed product/Harness docs phase: Phase 7G Open Dynamic Workflows Reference Alignment, archived at `harness/changes/archive/20260602-phase-7g-open-dynamic-workflows-reference-alignment/summary.md`.

Latest Harness evolution: `harness/changes/archive/20260610-auto-evolve-harness-phase-8g-8k-boundary-evidence/summary.md`, which completed the Phase 8G-8K pending window as `noop/subagent_review` with subagent score `90/100`.

Current active phase: Phase 8N Run Evidence Manager Boundary Split.



