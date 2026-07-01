# Spec: main-agent-workflowgraph-decision-policy-v1

## Goal

Introduce an internal `MainAgentWorkflowGraphDecisionPolicy` that turns a read-only WorkflowGraph replay summary core into a non-executing main-agent recommendation.

The policy should move the next-step interpretation out of `workflowgraph-replay.ts` without becoming workflow truth or an execution path.

## Users

- Internal AHO main-agent orchestration code.
- Future architecture migration work that needs one policy-shaped input before connecting recovery, scheduler candidates, or richer main-agent decisions.

## Acceptance Criteria

- AC-001: A new decision policy owner exists and returns non-executing recommendations with `authority: "non-executing-main-agent-workflowgraph-decision-policy"` and `executionStarted: false`.
- AC-002: `workflowgraph-replay.ts` builds a summary core first, then derives `nextObservation` through the policy without passing a complete summary back into itself.
- AC-003: Replay no longer imports or calls `decideMainAgentWorkflowGraph`; current replay state is derived from canonical workflow/queue/current evidence.
- AC-004: `decideMainAgentWorkflowGraph` is no longer exported from `src/main-agent-orchestration/index.ts`, but graph observation evidence still works.
- AC-005: Policy and replay outputs do not contain executable action payloads, confirmation payloads, scheduler transitions, or apply/close recommendations.
- AC-006: Existing Harness authority and runtime behavior are unchanged.

## Non-Goals

- No Workbench UI changes.
- No action bridge, confirmation queue, action registry, revalidation, or automation allowlist changes.
- No Scheduler, WorkerLease, IntegrationCheck, Terminal, apply, close, remote, PR, merge, or Harness evolution execution.
- No free LLM decision policy.
- No removal of role or queue deterministic helpers.

## Constraints

- `MainAgentWorkflowGraphDecisionPolicyInput` must not include `nextObservation`.
- Replay historical jsonl remains explanatory only; canonical managers remain current-state source.
- The new policy must not import Workbench UI, action handlers, scheduler runtime, workflow runtime, terminal, apply/close, SQLite writers, or automation allowlist.
- The graph observation owner retains `observeMainAgentWorkflowGraph`, `recordMainAgentWorkflowGraphObservation`, `readMainAgentWorkflowGraphDecisionEvidence`, and `workflowgraph-decisions.jsonl`.

## Risks

- A circular policy/replay type could turn `nextObservation` into a self-referential contract.
- Leaving replay dependent on `decideMainAgentWorkflowGraph` would keep graph-level classifier logic as a hidden main-agent policy.
- A broad policy name could be confused with Goal Loop decisions or action bridge assessments.
- Adding executable fields would blur Harness truth and approval boundaries.
