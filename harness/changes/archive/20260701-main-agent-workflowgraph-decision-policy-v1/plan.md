# Plan: main-agent-workflowgraph-decision-policy-v1

## Approach

Add a narrow non-executing policy owner. Refactor replay summary construction into a core object plus policy-derived `nextObservation`, and keep graph observation classification private to graph evidence recording.

## Steps

1. Add `decision-policy.ts` with input, recommendation, and mapping logic.
2. Refactor `workflowgraph-replay.ts` to remove `buildNextObservation`, remove the classifier import, derive current state from canonical workflow/queue evidence, and call the policy after summary core construction.
3. Update `index.ts` exports so `decideMainAgentWorkflowGraph` is no longer public.
4. Add policy tests and update replay / module-boundary tests.
5. Run targeted and aggregate verification.

## Decisions

- Policy name is WorkflowGraph-specific to avoid confusion with Goal Loop, next-step evidence, or action bridge decisions.
- Replay summary remains read-only and keeps its existing authority string.
- `decideMainAgentWorkflowGraph` remains inside `workflowgraph-observation.ts` for graph evidence writing.
- Role and queue deterministic policies stay as lower-level helpers in this slice.

## Minimality Gate Plan

- Can this be a no-op: no; replay currently owns a local next-observation strategy and imports the graph classifier.
- Reuse: builds on existing WorkflowGraph replay, observation, queue/role evidence, and module-boundary tests.
- Shared root fix: moves replay-local strategy into one reusable policy owner instead of adding another local helper.
- Avoided: no UI, no action bridge expansion, no scheduler path, no free LLM policy.
- Smallest coherent change: one owner plus replay/export/tests refactor.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/decision-policy.ts`.
- New / moved responsibilities: non-executing WorkflowGraph policy recommendation and next-observation derivation.
- Facade touch points: `src/main-agent-orchestration/index.ts` exports policy types/functions and stops exporting `decideMainAgentWorkflowGraph`.
- Forbidden write-back locations: Workbench UI, confirmation queue, workflow actions, scheduler runtime, workflow runtime, terminal, apply/close, SQLite writers.
- Compatibility surface: replay summary API remains; `nextObservation` remains present but policy-derived.
- Boundary tests: module-boundary assertions for imports, export removal, and forbidden executable fields.
- Follow-up split candidates: role/queue deterministic policy consolidation later.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: replay summary, graph observation evidence, queue decision evidence, role loop evidence, canonical managers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: replay-local `buildNextObservation` is not a stable policy owner and cannot safely grow toward main-agent decisions.
- Domain-specific logic location: WorkflowGraph policy under main-agent orchestration.
- Shared cross-cutting logic location: none added beyond the owner; no new framework.
- Local framework / state machine / projection / validation / gate avoided: policy emits only non-executing recommendation, not actions or gates.
- Future-cost reduction for similar features: future recovery/scheduler policy can consume one policy-shaped output instead of scattered replay branches.

## Planning-Discovered Gaps

- Subagent review found two required fixes: avoid policy input circularity and remove replay's hidden dependency on `decideMainAgentWorkflowGraph` for `currentState.kind`.
