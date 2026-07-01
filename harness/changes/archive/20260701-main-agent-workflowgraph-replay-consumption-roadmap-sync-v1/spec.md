# Spec: main-agent-workflowgraph-replay-consumption-roadmap-sync-v1

## Goal

Make WorkflowGraph replay summaries a standard internal observation input after graph-level state changes, without creating a new executable runner or user-facing surface.

Also update main-agent migration documentation so future work starts from the current role/queue/replay/policy architecture instead of obsolete roadmap text.

## Users

- Internal AHO main-agent orchestration code.
- Future architecture migration work that needs a reliable read-only WorkflowGraph replay input.
- Future agents reading `docs/CURRENT-DEVELOPMENT-PLAN.md` and `docs/STATUS.md`.

## Acceptance Criteria

- AC-001: A helper exists under the main-agent orchestration owner that performs `record WorkflowGraph observation -> build replay summary` and returns both results.
- AC-002: Planning milestone handlers and TaskQueue lifecycle use the helper instead of directly recording graph observation alone.
- AC-003: Replay summary remains in-memory only and does not enter Workbench UI, confirmationQueue, transcript, prompt context, right rail, Agent graph, SQLite, or durable replay artifacts.
- AC-004: `nextObservation` is never consumed as an executable instruction; in particular `continue-queue-step-loop` must not call queue runners, action handlers, scheduler, or automation.
- AC-005: `docs/CURRENT-DEVELOPMENT-PLAN.md` and `docs/STATUS.md` reflect the current main-agent migration state and latest closeout.
- AC-006: Existing Harness workflow authority and runtime behavior remain unchanged.

## Non-Goals

- No UI changes.
- No action bridge expansion.
- No Scheduler, WorkerLease, IntegrationCheck, Terminal, apply, close, remote, PR, merge, or Harness evolution execution.
- No new persistent replay artifact, SQLite table, workflow truth, or prompt context.
- No free LLM decision policy.
- No deletion of `MainAgentLoopProjection`, `rolePipeline`, or `role.pipeline.*` names in this change.

## Constraints

- The helper must not import Workbench UI, confirmation queue builders, action handlers, scheduler runtime, terminal, apply/close modules, or automation allowlists.
- The helper must reuse `recordMainAgentWorkflowGraphObservation(...)` and `buildMainAgentWorkflowGraphReplaySummary(...)`; it must not duplicate graph observation or replay policy logic.
- Planning and TaskQueue call sites must ignore replay output for execution in V1.
- Documentation updates should summarize current state and next steps without expanding `AGENTS.md` or `docs/STATUS.md` into an archive ledger.

## Risks

- Treating `nextObservation.kind` as executable would accidentally create a hidden scheduler/queue continuation path.
- Adding replay calls directly to many handlers would scatter policy-shaped logic and make future migration harder.
- Leaving roadmap drift would cause future agents to repeat already-completed migration slices.
- Expanding docs too much would increase documentation entropy.
