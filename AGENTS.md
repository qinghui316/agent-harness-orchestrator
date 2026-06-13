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
- Phase 8K completed Scoped Workflow Artifact Boundary Split and is archived at `harness/changes/archive/20260610-phase-8k-scoped-workflow-artifact-boundary-split/summary.md`.
- Phase 8L completed Scoped WorkflowRun Boundary Split and is archived at `harness/changes/archive/20260610-phase-8l-scoped-workflowrun-boundary-split/summary.md`.
- Phase 8M completed Scoped Change Lifecycle Boundary Split and is archived at `harness/changes/archive/20260610-phase-8m-scoped-change-lifecycle-boundary-split/summary.md`.
- Phase 8N completed Run Evidence Manager Boundary Split and is archived at `harness/changes/archive/20260610-phase-8n-run-evidence-manager-boundary-split/summary.md`.
- Phase 8O completed Scoped Worktree Metadata Boundary Split and is archived at `harness/changes/archive/20260610-phase-8o-scoped-worktree-metadata-boundary-split/summary.md`.
- Phase 8P completed Scoped Validation Audit Evidence Boundary Split and is archived at `harness/changes/archive/20260611-phase-8p-scoped-validation-audit-evidence-boundary-split/summary.md`.
- Phase 8Q completed Workbench Action Handler Residual Boundary Split and is archived at `harness/changes/archive/20260611-phase-8q-workbench-action-handler-residual-boundary-split/summary.md`.
- Phase 8R completed Future Feature Module Boundary Rule and is archived at `harness/changes/archive/20260611-phase-8r-future-feature-module-boundary-rule/summary.md`. It records the long-term rule that future product features extend owned modules first rather than putting main implementation logic back into broad compatibility facades.
- Phase 8S completed Parallel TaskGraph Readiness Scheduler Contract and is archived at `harness/changes/archive/20260611-phase-8s-parallel-taskgraph-readiness-scheduler-contract/summary.md`. It added a non-executing SchedulerContract typed artifact for parallel TaskGraph candidates; it did not add a parallel executor, scheduler runtime, child Change creation, ODWF JavaScript runtime, or cache/replay.
- Harness evolution after Phase 8S completed as `noop/subagent_review` and is archived at `harness/changes/archive/20260611-auto-evolve-harness-phase-8o-8s-boundary-evidence/summary.md`. Authorized subagent review recommended `noop` with score `92/100`; existing scoped evidence, module-boundary, proposal/runtime, and SchedulerContract no-execution coverage was sufficient.
- Phase 8T completed AgentScope Harness Reference Alignment and is archived at `harness/changes/archive/20260611-phase-8t-agentscope-harness-reference-alignment/summary.md`. It added the AgentScope 2.0 Python reference, refreshed AgentScope Java Harness mapping, and documented Runtime Continuity Layer boundaries without adding runtime behavior.
- Phase 8U completed Runtime Continuity Contract Foundation and is archived at `harness/changes/archive/20260611-phase-8u-runtime-continuity-contract-foundation/summary.md`. It added AHO-owned WorkerSession, RuntimeWorkspace, EventSource, and AgentEventEnvelope evidence for code runs only without adding parallel execution, scheduler runtime, Workbench actions, routes, CLI commands, sandbox backends, child Changes, ODWF JavaScript runtime, or cache/replay.
- Phase 8V completed Validation Audit Runtime Continuity Coverage and is archived at `harness/changes/archive/20260611-phase-8v-validation-audit-runtime-continuity-coverage/summary.md`. It extends Runtime Continuity sidecar evidence to validation command runs and audit Codex readonly runs while keeping public Run, Validation, Audit, CLI, Workbench, SSE, and workflow truth shapes unchanged.
- Phase 8W completed Runtime Permission External Execution Evidence Contract and is archived at `harness/changes/archive/20260611-phase-8w-runtime-permission-external-execution-evidence-contract/summary.md`. It records permission profile, mirrored ToolPolicy decision, and external execution lifecycle evidence in existing Runtime Continuity `agent-events.jsonl` streams without adding a permission engine, Workbench action, HTTP route, CLI command, UI/lazy projection, scheduler, parallel executor, or workflow-truth authority.
- Phase 8Y completed Scheduler Dispatch Reconcile Dry Run Evidence and is archived at `harness/changes/archive/20260611-phase-8y-scheduler-dispatch-reconcile-dry-run-evidence/summary.md`. It added non-executing dispatch/reconcile dry-run evidence over SchedulerContract without starting workers, allocating leases, creating runtime records, child Changes, ODWF runtime, or cache/replay.
- Phase 8Z completed Scheduler Worker Session Plan Recovery Contract and is archived at `harness/changes/archive/20260611-phase-8z-scheduler-worker-session-plan-recovery-contract/summary.md`. It added non-executing Scheduler Worker Session Plan / Recovery Contract evidence after dry-run and before any parallel executor.
- Phase 9A completed Scheduler Claim Reconcile Plan Foundation and is archived at `harness/changes/archive/20260611-phase-9a-scheduler-claim-reconcile-plan-foundation/summary.md`. It added non-executing Scheduler Claim / Reconcile Plan evidence after worker-session planning and before any scheduler runtime or parallel executor.
- Phase 9B completed Scheduler Launch Preflight Contract and is archived at `harness/changes/archive/20260611-phase-9b-scheduler-launch-preflight-contract/summary.md`. It added non-executing Scheduler Launch Preflight evidence after claim/reconcile planning and before any scheduler runtime or parallel executor.
- Phase 9C completed SchedulerRun Journal Shell Human Gated Launch Record and is archived at `harness/changes/archive/20260611-phase-9c-schedulerrun-journal-shell-human-gated-launch-record/summary.md`. It added a non-executing SchedulerRun journal shell after checked launch preflight, without starting workers, allocating leases, creating runtime sidecars, or authorizing parallel execution.
- Phase 9D Scheduler Runtime Reconcile Shell completed and is archived at `harness/changes/archive/20260611-phase-9d-scheduler-runtime-reconcile-shell/summary.md`. It adds SchedulerRun-scoped runtime sidecar state and reconcile snapshots without changing SchedulerRun JSON shape, starting workers, allocating leases, creating TaskRuns/WorkerSessions/worktrees/runs, or authorizing parallel execution.
- Phase 9E Scheduler Runtime Claim Reservation Shell completed and is archived at `harness/changes/archive/20260611-phase-9e-scheduler-runtime-claim-reservation-shell/summary.md`. It adds SchedulerRun-scoped claim reservation evidence for the latest reconcile snapshot, but it must not start workers, allocate real slots, create WorkerLeases/WorkerSessions/TaskRuns/worktrees/runs, or authorize parallel execution.
- Phase 9F Main Agent Parallel Plan Preparation Launch Confirmation Surface completed and is archived at `harness/changes/archive/20260611-phase-9f-main-agent-parallel-plan-preparation-launch-confirmation-surface/summary.md`. It collapses ordinary scheduler confirmations into two user-facing Harness stage gates: `准备并行执行计划` and `确认启动这个并行执行计划`. Internal scheduler artifacts remain audit/recovery/stale-revalidation evidence and must not become worker start, lease allocation, TaskRun creation, WorkerSession creation, worktree/run creation, child Change creation, or parallel execution authorization.
- Phase 9G Scheduler First Coder Worker Start Gate completed and is archived at `harness/changes/archive/20260611-phase-9g-scheduler-first-coder-worker-start-gate/summary.md`. It adds the first controlled scheduler execution slice: after user confirmation it can start exactly one coder-stage worker from the latest scheduler claim reservation, while still forbidding whole-wave dispatch, validation, audit, bounded rework, scheduler loops, slot allocators, child Changes, and the full parallel executor.
- Phase 9H Scheduler First Worker Result Reconcile Gate completed and is archived at `harness/changes/archive/20260612-phase-9h-scheduler-first-worker-result-reconcile-gate/summary.md`. It reconciles only the first scheduler coder worker started by Phase 9G: completed code evidence becomes scheduler-owned worker result evidence, TaskRun moves to `evidence-ready`, and WorkerLease is released. It does not start validation, audit, bounded rework, a second worker, a whole wave, a scheduler loop, a slot allocator, apply/landing, child Changes, or the full parallel executor.
- Phase 9I Scheduler First Worker Validation Gate completed and is archived at `harness/changes/archive/20260612-phase-9i-scheduler-first-worker-validation-gate/summary.md`. It validates only the evidence-ready first scheduler coder worker result from Phase 9H on that worker's scoped worktree. It may write scheduler-owned validation evidence and run one existing validation path, but it must not start audit, bounded rework, a second worker, a whole wave, a scheduler loop, a slot allocator, apply/landing, child Changes, or the full parallel executor.
- Phase 9J Scheduler First Worker Audit Gate completed and is archived at `harness/changes/archive/20260612-phase-9j-scheduler-first-worker-audit-gate/summary.md`. It audits only the first scheduler worker whose scheduler-owned validation evidence passed in Phase 9I, binds audit to the exact validation run and same worktree, and may mark that TaskRun completed only for audit `approved` / `approved-with-notes`. It does not start bounded rework, a second worker, whole-wave dispatch, scheduler loop, slot allocator, apply/landing, child Changes, or the full parallel executor.
- Phase 9K Scheduler First Worker Bounded Rework Plan Contract completed and is archived at `harness/changes/archive/20260612-phase-9k-scheduler-first-worker-bounded-rework-plan-contract/summary.md`. It compiles scheduler-owned rework planning evidence after first-worker validation failed or audit blocked/failed. It does not execute rework, does not call `startCodeRun()`, does not add existing-worktree continuation, and must not create TaskRuns, WorkerLeases, WorkerSessions, RuntimeWorkspaces, EventSources, worktrees, runs, AgentTasks, WorkflowRuns, TaskQueueRuns, child Changes, whole-wave dispatch, scheduler loops, apply/landing, or full parallel executor behavior.
- Phase 9L Scheduler First Worker Rework Execution Gate completed and is archived at `harness/changes/archive/20260612-phase-9l-scheduler-first-worker-rework-execution-gate/summary.md`. It starts exactly one scoped `rework-coder` from a scheduler-owned `SchedulerRuntimeWorkerReworkPlan`, reuses the original worker worktree through a scheduler-only `scheduler-claim-rework` code gate, and may create one rework TaskRun, one rework WorkerLease, one rework code run, and Runtime Continuity sidecars. It must not create a new worktree, validate/audit/reconcile the rework result, start a next worker or whole wave, run a scheduler loop or slot allocator, create child Changes, run IntegrationCheck/apply/PR/merge, or become the full parallel executor.
- Phase 9M Scheduler First Worker Rework Result Reconcile Gate completed and is archived at `harness/changes/archive/20260612-phase-9m-scheduler-first-worker-rework-result-reconcile-gate/summary.md`. It reconciles only the first scheduler rework worker started by Phase 9L: completed rework code evidence becomes scheduler-owned rework result evidence, the rework TaskRun moves to `evidence-ready`, and the rework WorkerLease is released. It must not start validation, audit, another rework, a next worker, a whole wave, a scheduler loop, IntegrationCheck/apply/PR/merge, new worktrees, new runs, child Changes, or the full parallel executor.
- Phase 9N Scheduler First Worker Rework Validation Gate completed and is archived at `harness/changes/archive/20260612-phase-9n-scheduler-first-worker-rework-validation-gate/summary.md`. It validates only the first scheduler rework worker result reconciled by Phase 9M on the same reused worktree. It may write scheduler-owned rework validation evidence and run one existing validation path, but it must not start audit, another rework, next-worker dispatch, whole-wave dispatch, scheduler loops, IntegrationCheck/apply/merge, new worktrees, new runs, child Changes, or the full parallel executor.
- Phase 9O Scheduler First Worker Rework Audit Gate completed and is archived at `harness/changes/archive/20260612-phase-9o-scheduler-first-worker-rework-audit-gate/summary.md`. It audits only a passed scheduler-owned rework validation from Phase 9N on the same reused worktree and exact validation run. It may write scheduler-owned rework audit evidence and run one existing audit path, but it must not start another rework, next-worker dispatch, whole-wave dispatch, scheduler loops, IntegrationCheck/apply/merge, new worktrees, new coder/rework runs, child Changes, or the full parallel executor.
- Phase 9P Scheduler Worker Integration Candidate Bridge completed and is archived at `harness/changes/archive/20260613-phase-9p-scheduler-worker-integration-candidate-bridge/summary.md`. It compiles scheduler-owned `SchedulerIntegrationCandidate` evidence from scheduler worker or rework worker audit-approved outputs, re-runs existing apply readiness gates for each output worktree, and waits for at least two ready targets before any later IntegrationCheck handoff. It does not start next workers, validation, audit, rework, IntegrationCheck, aggregate validation/audit, apply, landing, PR, merge, child Changes, new worktrees/runs, scheduler loops, slot allocation, or the full parallel executor.
- Phase 9Q Scheduler IntegrationCheck Handoff completed and is archived at `harness/changes/archive/20260613-phase-9q-scheduler-integrationcheck-handoff/summary.md`. It consumes the latest scheduler-owned `SchedulerIntegrationCandidate` with at least two ready worktree targets, revalidates scheduler and target scope, delegates to the existing explicit `runIntegrationCheck(project, worktreeIds)` path, and writes scheduler-owned handoff evidence. It must not implement a new IntegrationCheck engine, apply, landing, PR, merge, next-worker dispatch, whole-wave dispatch, scheduler loop, slot allocator, child Changes, or full parallel executor behavior.
- Auto Evolve Harness Phase 9F 9J Scheduler Worker Gates Evidence completed and is archived at `harness/changes/archive/20260612-auto-evolve-harness-phase-9f-9j-scheduler-worker-gates-evidence/summary.md`. It handled the Phase 9F-9J scheduler worker gate evolution window as `noop/subagent_review` with subagent score `92/100`; existing user-surface honesty, module-boundary, proposal/runtime, ToolPolicy/human gate, scheduler non-execution, and workflow-truth rules are sufficient. It is Harness evidence only and does not change product code, runtime behavior, Workbench actions, routes, CLI commands, UI, scheduler execution, parallel executor behavior, child Changes, ODWF runtime, or cache/replay.
- Auto Evolve Harness Phase 9J 9N Scheduler Rework Evidence completed and is archived at `harness/changes/archive/20260612-auto-evolve-harness-phase-9j-9n-scheduler-rework-evidence/summary.md`. It handled the Phase 9J-9N scheduler rework evidence window as `noop/subagent_review` with subagent score `92/100`; existing scheduler worker/rework gate, same-worktree rework, module-boundary, ToolPolicy/human gate, workflow-truth, and integration-bridge boundary coverage is sufficient. It is Harness evidence only and does not change product code, runtime behavior, Workbench actions, routes, CLI commands, UI, scheduler execution, parallel executor behavior, child Changes, ODWF runtime, or cache/replay.
- Auto Evolve Harness Phase 9B 9F Scheduler Runtime Surface Evidence completed and is archived at `harness/changes/archive/20260611-auto-evolve-harness-phase-9b-9f-scheduler-runtime-surface-evidence/summary.md`. It handled the generated Phase 9B-9F pending evolution window as `noop/subagent_review` with subagent score `94/100`; no new Harness rule was added.
- Harness evolution after Phase 9B completed as `noop/subagent_review` and is archived at `harness/changes/archive/20260611-auto-evolve-harness-phase-8w-9b-scheduler-pre-executor-evidence/summary.md`. Authorized subagent review recommended `noop` with score `93/100`; existing proposal/runtime, Runtime Continuity auxiliary evidence, ToolPolicy authority, human gate, and future feature module-boundary rules are sufficient for the Phase 8W-9B scheduler pre-executor evidence window.
- Phase 10C Main Agent Goal Loop Decision Evidence Foundation is closed and archived at `harness/changes/archive/20260614-phase-10c-main-agent-goal-loop-decision-evidence-foundation/summary.md`. It adds non-executing `GoalLoopDecision` planning evidence for selected Changes so the main Agent can explain conflict-aware next-step recommendations without starting workers, scheduler loops, validation, audit, IntegrationCheck, apply/close, child Changes, or source mutations.
- Phase 10D Goal Loop Confirmation Surface is closed and archived at `harness/changes/archive/20260614-phase-10d-goal-loop-confirmation-surface/summary.md`. It exposes `planning.goal-loop.evaluate` as a fallback Workbench confirmation only when no more specific current confirmation exists. It does not place Goal Loop evaluation in `workpad.nextAction`, execute `GoalLoopDecision.recommendedAction`, hide concrete human gates, or create scheduler/runtime/source mutation artifacts.
- Phase 10E Goal Loop Iteration Journal Evidence is closed and archived at `harness/changes/archive/20260614-phase-10e-goal-loop-iteration-journal-evidence/summary.md`. It adds scoped `GoalLoopIteration` continuation evidence for each confirmed Goal Loop evaluation while preserving `planning.goal-loop.evaluate` as non-executing fallback evidence.
- Phase 10F Goal Loop Continuation State Evidence is closed and archived at `harness/changes/archive/20260614-phase-10f-goal-loop-continuation-state-evidence/summary.md`. It extends `GoalLoopIteration` with evidence-only continuation state, control-policy constraints, budget/accounting signal, and resume preconditions without adding a Goal Loop controller, new action, scheduler loop, worker start, source mutation, or close authority.
- Phase 10G Goal Loop Continuation Brief Evidence is closed and archived at `harness/changes/archive/20260614-phase-10g-goal-loop-continuation-brief-evidence/summary.md`. It adds non-executing continuation brief evidence derived from `GoalLoopDecision` and `GoalLoopIteration` so a future main Agent turn can re-read current Change evidence and continue the full objective without copying Codex goal runtime behavior.
- Phase 10H Goal Loop Evidence Projection Resume Surface is closed and archived at `harness/changes/archive/20260614-phase-10h-goal-loop-evidence-projection-resume-surface/summary.md`. It projects latest Goal Loop decision, iteration, and continuation brief evidence into the selected Workpad as read-only resume context without adding a controller, new action, scheduler loop, worker start, source mutation, or automatic recommended-action execution.
- Active change: none.
- Pending Harness evolution: none.
- Latest Harness evolution: `harness/changes/archive/20260614-auto-evolve-harness-phase-10d-10h-goal-loop-evidence-projection/summary.md`, which completed the Phase 10D-10H pending window as `noop/subagent_review` with subagent scores `93/100` and `92/100`.

Current baseline includes Codex app-server planning/coder turns, result review/apply handoff, foreground AgentTasks, advisory background maintenance ledger/candidate/score/review artifacts, bounded demand worker slots, scoped apply readiness/source refresh rework, parent-agent demand conversation surfaces, a confirmation queue with local integration checks, Phase 6M aggregate validation/audit plus bounded IntegrationFix before source-root apply, Phase 6N local landing readiness packages plus read-only merge-reviewer verdicts after source-root apply, Phase 6O GitHub CLI Draft PR handoff after landing review passes, Phase 6P main-agent PR feedback orchestration plus same-Draft-PR branch updates after user confirmation, Phase 6Q ready-for-review handoff, Phase 6R thread-aware review feedback/reply handoff, Phase 6S demand memory closeouts, five-terminal-change maintenance reviews, doc drift/budget guardrails, role-scoped context projection for maintenance memory, Phase 6T user-confirmed remote PR landing plus post-merge memory boundaries, Phase 6U post-merge reconcile with optional safe local fast-forward local sync / remote PR head branch cleanup, Phase 6V project-level remote landing queues that refresh explicit PR candidates and merge at most one PR per user confirmation, Phase 6W demand agent run graph projection, Phase 6X Codex-style parent-agent transcript plus inline `对话 / Agent 运行图` tabs, Phase 6Y controlled `delegateTask` tool contract and process metadata, Phase 6Z main-agent tool orchestration with ToolPolicyGate / WorkerPermissionProfile / ToolEventAudit / PostRunBoundaryAudit, Phase 7A Codex-equivalent runtime transcript cells, Phase 7B Codex/Open Design transcript renderer alignment, Phase 7C lightweight Workbench snapshot shell plus scoped lazy loaders, Phase 7D ChangeTarget binding for runnable and closeable active demand targets, Phase 7E RoleContextPacket artifacts for core role-run A2A context, Phase 7F deterministic MainAgentOrchestrationDecisionEngine for default foreground role/rework choices, Phase 7G reference/docs alignment for Open Dynamic Workflows lessons, Phase 7H selected-demand/action-boundary fixes plus a proposal-only DecompositionPlan layer, Phase 7I non-executable DecompositionReadinessManifest guardrail checks for confirmed DecompositionPlan artifacts, Phase 7J strict typed execution gating plus TaskQueueProposal pre-execution artifacts, Phase 7K typed WorkflowRun journal/recovery evidence for sequential TaskQueue execution, Phase 7L versioned WorkflowGraphPlan execution input between TaskQueueProposal and WorkflowRun start, Phase 7M scoped workflow action/runtime modularization, Phase 7N Workbench/runtime large-file boundary split, Phase 7O Workbench server/projection/UI boundary split, Phase 7P action execution/runtime kernel boundary split, Phase 7Q Workbench read-model/UI boundary split, Phase 7R Workbench projection-builder boundary split, Phase 7S Workbench chat boundary split, Phase 7T Workbench frontend surface boundary split, Phase 7U workflow runtime kernel boundary split, Phase 7V read-model / confirmation queue boundary split, Phase 7W Workbench server/API Boundary Split, Phase 7X Workbench read-model residual split, Phase 7Y Workbench frontend residual split, Phase 7Z CLI command / type barrel boundary split, Phase 8A AgentTask / maintenance domain boundary split, Phase 8B scoped Change Proposal boundary split, Phase 8C code execution manager boundary split, Phase 8D scoped Integration Check boundary split, Phase 8E remote handoff / PR landing domain split, Phase 8F apply / landing / PR draft / landing queue boundary split, Phase 8G scoped Spec-Test evidence boundary split, Phase 8H strict TaskQueue typed-scope validation plus TaskQueue domain split, Phase 8I DemandWorker domain split, Phase 8J scoped TaskRun / WorkerLease evidence matching plus TaskRun domain split, Phase 8K scoped workflow artifact Change-scope guards plus workflow-artifacts domain split, Phase 8L WorkflowRun Change/queue/event scope guard plus workflow-run domain split, Phase 8M scoped Change lifecycle boundary split, Phase 8N Run evidence manager boundary split, Phase 8O Worktree metadata scope guard plus Worktree domain split, Phase 8P Validation/Audit evidence scope guard plus Validation/Audit manager boundary split, Phase 8Q Workbench action handler residual boundary split, Phase 8R Future Feature Module Boundary Rule, Phase 8S non-executing SchedulerContract foundation for parallel TaskGraph readiness, Phase 8T AgentScope Harness reference alignment, Phase 8U Runtime Continuity Contract Foundation, Phase 8V Validation Audit Runtime Continuity Coverage, Phase 8W Runtime Permission External Execution Evidence Contract, Phase 8Y Scheduler Dispatch Reconcile Dry Run Evidence, Phase 8Z Scheduler Worker Session Plan Recovery Contract, Phase 9A Scheduler Claim Reconcile Plan Foundation, Phase 9B Scheduler Launch Preflight Contract, Phase 9C SchedulerRun Journal Shell Human Gated Launch Record, Phase 9D Scheduler Runtime Reconcile Shell, Phase 9E Scheduler Runtime Claim Reservation Shell, Phase 9F Main Agent Parallel Plan Preparation Launch Confirmation Surface, Phase 9G Scheduler First Coder Worker Start Gate, Phase 9H Scheduler First Worker Result Reconcile Gate, and Phase 9I Scheduler First Worker Validation Gate. The Phase 8S-8W Harness evolution window has been marked complete as `noop/subagent_review` with subagent score `94/100`; no new Harness rule was added. The Phase 8G-8K Harness evolution window has been marked complete as `noop/subagent_review` with subagent score `90/100`; no new Harness rule was added. The Phase 8K-8O Harness evolution window is archived at `harness/changes/archive/20260610-auto-evolve-harness-phase-8k-8o-boundary-evidence/summary.md`; it completed as `noop/dry_run`, no subagent review was used, and no new Harness rule was added. `TaskQueueProposal` remains a proposal artifact, `WorkflowGraphPlan` is versioned execution input, `WorkflowRun` is runtime coordination/recovery evidence, and `SchedulerContract` is non-executing scheduler-readiness evidence; none of them replace workflow truth. Worktree metadata, Run, Validation, Audit, DemandWorker, and TaskRun / WorkerLease remain bounded evidence or execution coordination records, not workflow truth. Phase 8U added WorkerSession, RuntimeWorkspace, EventSource, and AgentEventEnvelope as code-run runtime auxiliary evidence only; Phase 8V extends that sidecar evidence to validation/audit role-worker runs without replacing Run, TaskRun, Validation, Audit, SchedulerContract, or human gates. Phase 8W records permission profile and external-execution lifecycle evidence in the existing Runtime Continuity event stream without adding a permission engine or changing ToolPolicyGate authority. Phase 8Y added non-executing scheduler dry-run evidence, Phase 8Z adds non-executing worker-session/recovery planning evidence, Phase 9A adds non-executing claim/reconcile planning evidence, Phase 9B adds non-executing launch preflight evidence, Phase 9C adds a non-executing SchedulerRun journal shell, Phase 9D adds SchedulerRun-scoped runtime shell sidecars, Phase 9E adds SchedulerRun-scoped claim reservation evidence, Phase 9F collapses scheduler preparation/launch confirmation into two user-facing Harness stage gates, Phase 9G starts only one confirmed coder-stage scheduler worker, Phase 9H reconciles only that first coder worker result into scheduler-owned evidence, and Phase 9I validates only that evidence-ready worker result on its scoped worktree; none authorize full parallel execution. The default Workbench conversation renders only Codex runtime or `codex exec` replay cells, with command/tool/file details collapsed behind row details, while AHO orchestration/evidence records stay in graph/details/confirmation/evidence surfaces unless literally present in the Codex-visible transcript. Maintenance is project-level background evidence and must not be default selected-demand run graph or confirmation queue content. Executable WorkflowPlan JavaScript scripts, ODWF runtime integration, full parallel scheduler, automatic child Change creation, landing skills, reviewer assignment, unattended automatic merge, unsafe local source rewrite, local branch deletion, true SubAgent chat, editable graph canvases, container sandbox, remote worker isolation, dynamic multi-Change project conversations, silent canonical memory/doc rewrites, and LLM output cache reuse remain future work. The user-facing product model remains project folders containing demand conversations. `Change`, `ChangeTarget`, `RoleContextPacket`, `MainAgentOrchestrationState`, `DecompositionPlan`, `DecompositionReadinessManifest`, `TaskQueueProposal`, `WorkflowGraphPlan`, `WorkflowRun`, `SchedulerContract`, `SchedulerDispatchDryRun`, `SchedulerWorkerSessionPlan`, `SchedulerClaimReconcilePlan`, `SchedulerLaunchPreflight`, `SchedulerRun`, `SchedulerRuntimeState`, `SchedulerReconcileSnapshot`, `SchedulerRuntimeClaimReservation`, `SchedulerRuntimeWorkerResult`, `SchedulerRuntimeWorkerValidation`, `WorkerSession`, `RuntimeWorkspace`, `EventSource`, `AgentEventEnvelope`, `Workpad`, `Topic`, `TaskRun`, `WorkerLease`, queue state, TaskRepository, worker slot, claim, source drift, integration worktree, PR provider handles, remote landing provider state, post-merge git state, maintenance ledger, graph projection internals, policy/audit internals, and blocked/audit-blocked terms are internal or evidence-detail concepts unless a document explicitly discusses runtime architecture.

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
| AgentScope | AgentScope 2.0 event/message, permission, workspace/sandbox, multi-session service, agent team | `reference-projects/agentscope/` |
| AgentScope Java | Workspace memory, session, subagent specs, task repository | `reference-projects/agentscope-java/` |
| Open Design | Local daemon, Web UI shell, readable tool/activity cards | `reference-projects/open-design/` |
| OpenAI Codex | `codex exec`, JSONL, app-server runtime boundary, goal continuation, completion audit | `reference-projects/openai-codex/` |
| Loop Engineering | Goal-driven adaptive loop, conflict-aware parallelism, worktree / subagent / memory loop support | Web article: `https://addyosmani.com/blog/loop-engineering/` |
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

Active change: none.

Pending Harness evolution: none.

Latest completed product phase: Phase 10G Goal Loop Continuation Brief Evidence, archived at `harness/changes/archive/20260614-phase-10g-goal-loop-continuation-brief-evidence/summary.md`.

Latest completed product/Harness docs phase: Phase 10G Goal Loop Continuation Brief Evidence, archived at `harness/changes/archive/20260614-phase-10g-goal-loop-continuation-brief-evidence/summary.md`.

Latest Harness evolution: `harness/changes/archive/20260614-auto-evolve-harness-phase-9y-10d-goal-loop-evidence/summary.md`, which completed the Phase 9Y-10D pending window as `modify/subagent_review` with accepted Goal Loop recommendation-authority and fallback-priority review coverage.

Current active phase: none.

Phase 9G completed the first controlled scheduler execution slice. It may start exactly one coder-stage worker from the latest scheduler claim reservation after user confirmation, while keeping whole-wave dispatch, validation, audit, bounded rework, scheduler loops, slot allocators, child Changes, and the full parallel executor out of scope.

Phase 9H completed the first scheduler worker result reconcile gate. It reconciles only the first scheduler coder worker started by Phase 9G: completed code evidence becomes scheduler-owned worker result evidence, TaskRun moves to `evidence-ready`, and WorkerLease is released. It does not start validation, audit, bounded rework, a second worker, a whole wave, a scheduler loop, a slot allocator, apply/landing, child Changes, or the full parallel executor.

Phase 9I completed the first scheduler worker validation gate. It validates only the evidence-ready first scheduler coder worker result from Phase 9H on that worker's scoped worktree. It may write scheduler-owned validation evidence and run one existing validation path; it must not start audit, bounded rework, a second worker, a whole wave, a scheduler loop, a slot allocator, apply/landing, child Changes, or the full parallel executor.

Phase 9J completed the first scheduler worker audit gate. It audits only the first scheduler worker whose scheduler-owned validation evidence passed in Phase 9I, binds audit to the exact validation run and same worktree, and may mark that TaskRun completed only for audit `approved` / `approved-with-notes`; it does not start rework, a second worker, whole-wave dispatch, apply/landing, child Changes, or the full parallel executor.

Phase 9K completed the first scheduler worker bounded rework planning contract. It compiles scheduler-owned first-worker bounded rework planning evidence from validation failed or audit blocked/failed states, but does not execute rework, call `startCodeRun()`, or add same-worktree continuation support.

Phase 9L is archived. It starts exactly one scoped `rework-coder` from the scheduler rework plan, reuses the original worker worktree, and records the new rework TaskRun / WorkerLease / code run lineage. It does not validate or audit the rework result, start a second worker, run a whole wave, run IntegrationCheck/apply/merge, or solve final multi-worktree merging; final merge must still go through a future scheduler integration candidate bridge into the existing IntegrationCheck, aggregate validation/audit, and human apply gate.

Phase 9M is archived. It reconciles only that first scheduler rework worker result into scheduler-owned evidence. It may mark the rework TaskRun `evidence-ready` or `failed` and release the rework WorkerLease, but it must not start validation, audit, another rework, next-worker dispatch, whole-wave dispatch, scheduler loops, IntegrationCheck/apply/merge, new worktrees, new runs, child Changes, or the full parallel executor.

Phase 9N is archived. It validates only the first scheduler rework worker result reconciled by Phase 9M on the same reused worktree. It may write scheduler-owned rework validation evidence and run one existing validation path, but it must not start audit, another rework, next-worker dispatch, whole-wave dispatch, scheduler loops, IntegrationCheck/apply/merge, new worktrees, new runs, child Changes, or the full parallel executor.

Phase 9O is archived. It audits only a passed scheduler-owned rework validation from Phase 9N on the same reused worktree and exact validation run. It may complete the rework TaskRun only when audit is `approved` / `approved-with-notes`; blocked or failed audit blocks only the current rework path. It must not start another rework, next-worker dispatch, whole-wave dispatch, scheduler loops, IntegrationCheck/apply/merge, new worktrees, new coder/rework runs, child Changes, or the full parallel executor.

Phase 9P is archived. It bridges completed scheduler worker/rework worker outputs back into AHO's existing integration safety chain by compiling `SchedulerIntegrationCandidate` evidence and re-running apply readiness for each audit-approved worktree. It does not run IntegrationCheck or merge anything; final multi-worktree integration still goes through existing IntegrationCheck, aggregate validation/audit, and human apply gates.

Phase 9Q is archived. It consumes `SchedulerIntegrationCandidate` ready targets, invokes the existing IntegrationCheck path under scoped target validation, writes scheduler-owned handoff evidence, and still leaves IntegrationCheck result handling, aggregate validation/audit semantics, and human apply as existing gates.

Phase 9R is closed and archived at `harness/changes/archive/20260613-phase-9r-scheduler-integration-outcome-bridge/summary.md`. It bridges existing IntegrationCheck terminal/applied/discarded outcomes back into scheduler-owned runtime evidence without adding a new IntegrationCheck engine, source-root apply/discard path, landing/PR/merge behavior, next-worker dispatch, scheduler loop, slot allocator, child Changes, or full parallel executor behavior. Existing IntegrationCheck apply/discard confirmation remains the only source-root mutation gate.

Phase 9S is closed and archived at `harness/changes/archive/20260613-phase-9s-scheduler-next-worker-start-gate/summary.md`. It adds a user-confirmed `planning.scheduler.worker.start-next` gate that can start exactly one additional scheduler coder worker from the latest claim reservation after existing scheduler worker paths are terminal. It must not start validation, audit, rework, result reconcile, whole-wave dispatch, scheduler loops, slot allocation, IntegrationCheck, apply, landing, PR, merge, child Changes, or the full parallel executor.

Phase 9T is closed and archived at `harness/changes/archive/20260613-phase-9t-scheduler-current-worker-quality-gate-candidate-refresh-surface/summary.md`. It repairs the current-worker quality gate surface after start-next so Workbench result/validation/audit/rework gates target the selected worker path instead of a first-worker singleton, and it refreshes scheduler integration candidates when later approved worker outputs make the previous candidate stale.

Phase 9U is closed and archived at `harness/changes/archive/20260613-phase-9u-scheduler-two-worker-acceptance-surface/summary.md`. It proves the two-worker scheduler acceptance path: a second scheduler worker can run through the current-worker result/validation/audit gates, refresh `SchedulerIntegrationCandidate` to at least two ready worktree targets, and hand those targets to the existing IntegrationCheck path. It did not add a scheduler loop, whole-wave dispatch, slot allocator, new Workbench action, CLI command, HTTP route, apply/discard path, landing/PR/merge behavior, child Change creation, or full parallel executor.

Phase 9V is closed and archived at `harness/changes/archive/20260613-phase-9v-scheduler-integration-apply-discard-outcome-acceptance/summary.md`. It verifies that scheduler IntegrationCheck handoff returns to the existing `apply-check.apply` / `apply-check.discard` human gate, then records scheduler-owned outcome evidence after that existing gate changes IntegrationCheck state. It also tightens the owner-module direct-call guard so outcome reconciliation re-reads latest `SchedulerIntegrationCandidate` and fails closed on stale or mismatched handoff lineage. It did not add scheduler apply/discard, a new IntegrationCheck engine, next-worker dispatch, whole-wave dispatch, scheduler loops, slot allocation, landing, PR, merge, child Changes, or a full parallel executor.

Phase 9W is closed and archived at `harness/changes/archive/20260613-phase-9w-scheduler-integration-evidence-event-projection-hardening/summary.md`. It hardens SchedulerRun runtime event/projection coverage for the scheduler integration bridge by recording integration candidate, IntegrationCheck handoff, and terminal outcome transitions as scheduler-owned evidence. It does not add a new IntegrationCheck engine, scheduler-owned apply/discard, next-worker dispatch, whole-wave dispatch, scheduler loops, slot allocation, landing, PR, merge, child Changes, ODWF runtime, cache/replay, or a full parallel executor.

Phase 9X is closed and archived at `harness/changes/archive/20260613-phase-9x-schedulerrun-terminal-completion-projection/summary.md`. It adds SchedulerRun terminal completion projection after scheduler integration outcome so recovery and Workbench status can distinguish a finished scheduler run from merely recorded integration evidence. It does not add scheduler apply/discard, a new IntegrationCheck engine, next-worker dispatch, whole-wave dispatch, scheduler loops, slot allocation, landing, PR, merge, child Changes, or a full parallel executor.

Phase 9Y is closed and archived at `harness/changes/archive/20260613-phase-9y-scheduler-end-to-end-workbench-acceptance/summary.md`. It verifies the Workbench scheduler path through two worker outputs, existing IntegrationCheck apply/discard, SchedulerIntegrationOutcome, and SchedulerRunCompletion with cold-read projection recovery and confirmation queue honesty. It does not add scheduler runtime, a new IntegrationCheck engine, scheduler-owned apply/discard, next-worker dispatch, whole-wave dispatch, scheduler loops, slot allocation, landing, PR, merge, child Changes, or a full parallel executor.

Phase 9Z is closed and archived at `harness/changes/archive/20260613-phase-9z-schedulerrun-blocked-exhausted-closeout-gate/summary.md`. It adds a human-gated SchedulerRun blocked/exhausted terminal closeout before IntegrationCheck when the latest scheduler candidate cannot reach two ready targets and no legal continuation remains. It must only write scheduler-owned closeout evidence, runtime event, Workbench decision/projection, and SchedulerRun journal state; it must not run IntegrationCheck, apply/discard, validation, audit, rework, start workers, dispatch whole waves, allocate slots, create child Changes, create worktrees/runs, landing, PR, merge, or full parallel executor behavior.

Phase 10A is closed and archived at `harness/changes/archive/20260613-phase-10a-scheduler-user-facing-execution-surface-consolidation/summary.md`. It consolidates the Workbench scheduler execution confirmation surface so the main conversation and right-side queue use a small set of user-facing stage labels while existing typed scheduler actions, scoped payloads, ToolPolicyGate checks, stale-target revalidation, IntegrationCheck/apply handoff, and one-confirmation-per-legal-transition semantics remain intact. It is not a scheduler loop, start-all action, whole-wave dispatcher, slot allocator, automatic worker chain, source mutation path, child Change mechanism, or full parallel executor.

Phase 10B is closed and archived at `harness/changes/archive/20260614-phase-10b-loop-engineering-codex-goal-reference-alignment/summary.md`. It aligns AHO's next architecture direction with Loop Engineering and local Codex `goal` source: complex tasks should be managed as persistent Goal/Change loops, with low-conflict independent slices eligible for parallel work and high-conflict slices routed through sequential wait, rework, or integration-fix loops. This is docs/reference alignment only and does not add product runtime, Workbench actions, routes, CLI commands, UI, scheduler execution, child Changes, or artifact shape changes.

Phase 10C is closed and archived at `harness/changes/archive/20260614-phase-10c-main-agent-goal-loop-decision-evidence-foundation/summary.md`. It adds non-executing main-agent GoalLoopDecision planning evidence for the selected Change, with conflict-aware next-step recommendations and explicit forbidden actions. It must not start scheduler loops, workers, validation, audit, IntegrationCheck, apply/close, child Changes, or any source mutation; actual high-impact transitions remain separate ToolPolicyGate and human-gated actions.

Phase 10D is closed and archived at `harness/changes/archive/20260614-phase-10d-goal-loop-confirmation-surface/summary.md`. It exposes `planning.goal-loop.evaluate` as a fallback Workbench confirmation only when no more specific current confirmation exists. It does not place Goal Loop evaluation in `workpad.nextAction`, execute `GoalLoopDecision.recommendedAction`, hide concrete human gates, or create scheduler/runtime/source mutation artifacts.

Phase 10E is closed and archived at `harness/changes/archive/20260614-phase-10e-goal-loop-iteration-journal-evidence/summary.md`. It records each confirmed Goal Loop evaluation as non-executing iteration evidence.

Phase 10F is closed and archived at `harness/changes/archive/20260614-phase-10f-goal-loop-continuation-state-evidence/summary.md`. It adds continuation-state control constraints to GoalLoopIteration without adding a controller or execution authority.

Phase 10G is closed and archived at `harness/changes/archive/20260614-phase-10g-goal-loop-continuation-brief-evidence/summary.md`. It adds a derived continuation brief artifact for the next main Agent turn; the brief is prompt/handoff evidence only and must not auto-schedule continuation, execute recommended actions, mutate source, close a Change, or start scheduler/worker paths.

Auto Evolve Harness Phase 9R 9V Scheduler Integration Apply Evidence is closed and archived at `harness/changes/archive/20260613-auto-evolve-harness-phase-9r-9v-scheduler-integration-apply-evidence/summary.md`. It reviewed Phase 9R-9V as `noop/subagent_review` with subagent score `88/100`; existing Source Apply Safety, scoped action payload, proposal/runtime, module-boundary, scheduler non-execution, ToolPolicy/human gate, and workflow-truth rules are sufficient. It does not change product code, runtime behavior, Workbench actions, routes, CLI commands, UI, scheduler execution, parallel executor behavior, child Changes, ODWF runtime, or cache/replay.

Auto Evolve Harness Phase 9N 9R Scheduler Integration Evidence is closed and archived at `harness/changes/archive/20260613-auto-evolve-harness-phase-9n-9r-scheduler-integration-evidence/summary.md`. It handled the Phase 9N-9R pending window as `modify/subagent_review` with subagent score `84/100`, added Source Apply Safety review-template coverage, and added stale archived-review closeout lint. It is Harness evidence only and does not change product code, runtime behavior, Workbench actions, routes, CLI commands, UI, scheduler execution, parallel executor behavior, child Changes, ODWF runtime, or cache/replay.





