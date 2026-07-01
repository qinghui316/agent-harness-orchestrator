# Spec: main-agent-workflowgraph-policy-v2-replay-failure-boundary

## Goal

Tighten the non-executing WorkflowGraph replay policy after replay consumption has already been centralized. The policy must read as observation guidance, not an execution trigger, and replay/policy derivation failures must not block existing valid planning or TaskQueue gates.

## Users

- Future main-agent orchestration implementers who need one stable read-model policy for WorkflowGraph replay state.
- Current AHO users relying on existing planning and TaskQueue gates; their workflow behavior must remain unchanged.

## Acceptance Criteria

- AC-001: Active queue policy output uses observation-only language and never carries executable action, confirmation, scheduler, apply, or close payloads.
- AC-002: A created WorkflowRun without a fresh matching TaskQueue binding remains an observe/wait/gap state, never active queue continuation.
- AC-003: Malformed, old-schema, scope-mismatched, or stale historical evidence is surfaced as replay health/gaps and cannot be silently ignored.
- AC-004: `recordMainAgentWorkflowGraphObservationAndReplay(...)` keeps canonical observation write failures fail-closed, while replay/history/policy derivation failures degrade to a bounded replay gap instead of blocking existing valid planning or TaskQueue paths.
- AC-005: Historical observation classification and replay current-state classification remain intentionally separate, with representative parity coverage for shared canonical states.
- AC-006: Current roadmap/handoff docs no longer describe replay consumption as remaining work and correctly point to Policy V2 as the next main-agent architecture slice.

## Non-Goals

- No Workbench UI, transcript, right-rail, Agent graph, prompt context, or confirmation card changes.
- No action bridge expansion, workflow action type, confirmation queue change, action revalidation change, automation allowlist change, Scheduler/WorkerLease/IntegrationCheck integration, apply/close/remote/merge/PR/Harness evolution authority.
- No shared classifier extraction in this slice; parity coverage is sufficient until old-seam retirement.
- No archive summary rewrites.

## Constraints

- `MainAgentWorkflowGraphReplaySummary` remains an in-memory read model with `executionStarted: false`.
- Canonical managers remain the source of current state; historical JSONL can explain but cannot override current WorkflowRun / TaskQueue / TaskRun / AgentTask state.
- Observation evidence writing is still canonical for the graph observation slice and should fail closed if it cannot be written.
- Replay/policy failure hardening must not introduce a second persistence channel or SQLite table.

## Risks

- If replay/policy throws inside production helper calls, existing planning milestones could fail even though the user-facing gate is valid.
- If active queue guidance remains named like an imperative, future work may accidentally consume it as an execution signal.
- If docs keep stale "Replay consumption remaining" language, later agents may duplicate an already completed architecture slice.
