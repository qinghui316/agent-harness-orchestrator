# Plan: main-agent-orchestration-step-loop-contract-v1

## Approach

Add a narrow internal step-loop layer and move only the current runner control
flow behind it. Keep `orchestration-engine.ts` as the deterministic policy
source, and keep `leaf-stages.ts` as the execution/evidence owner. The new loop
does not write artifacts, create worktrees, or call Harness actions; it only
coordinates one leaf role at a time and threads the returned state forward.

## Steps

1. Create a `step-loop` module with internal types for observation, step
   decision, leaf step, and leaf result.
2. Move the current per-role switch from `runner.ts` into `runMainAgentLeafStep`
   so each call executes exactly one role.
3. Add a step-loop function that observes state, calls
   `decideNextMainAgentOrchestration`, runs one leaf, receives returned
   `orchestration`, and repeats until completion, failure, needs-user-input, or
   the safety iteration limit.
4. Update `runner.ts` entrypoints to call the step-loop with explicit policies:
   top-level demand may allow one automatic rework; TaskRun attempts are
   single-attempt; source-refresh and PR feedback rework start at rework-coder
   without nested automatic rework.
5. Update architecture/boundary and behavior tests.

## Decisions

- V1 keeps deterministic decision policy and does not introduce LLM/free
  dispatch.
- V1 `record` is state acceptance only, not a new persistent evidence writer.
- Existing parallel/worktree/Scheduler infrastructure remains out of scope and
  will be integrated only after the main-agent loop contract is stable.

## Minimality Gate Plan

- Can this be a no-op: no; the legacy public facade is retired, but the runner
  still contains a hidden fixed sequence that blocks the target loop shape.
- Reuse: `decideNextMainAgentOrchestration`, `createMainAgentOrchestrationState`,
  and the existing leaf stage functions remain the core mechanisms.
- Shared root fix: refactor the shared runner control flow rather than adding
  guards to individual entrypoints.
- Avoided: no UI, no new scheduler, no new action type, no new persisted
  journal, no free LLM decision policy.
- Smallest coherent change: one internal loop owner plus tests; no external
  API or authority expansion.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration`.
- New / moved responsibilities: runner control flow becomes explicit
  observe/decide/run-one-leaf/record-returned-state.
- Facade touch points: existing main-agent entrypoints remain exported from the
  module index.
- Forbidden write-back locations: workflow action handlers, confirmation queue,
  TaskQueue/Scheduler runtime, IntegrationCheck, apply/close, remote/PR/merge,
  Workbench UI.
- Compatibility surface: result shapes for top-level orchestration, TaskRun
  attempt, source-refresh rework, and PR feedback rework.
- Boundary tests: production imports and behavior tests proving the loop does
  not gain forbidden dependencies or authority.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: deterministic decision engine,
  leaf-stage execution/evidence owners, ToolPolicyGate path, and existing
  entrypoints.
- Why existing mechanisms are insufficient if a new mechanism is proposed: the
  existing runner mixes loop control with role execution dispatch, which keeps
  the fixed pipeline hidden and hard to evolve safely.
- Domain-specific logic location: role execution stays in `leaf-stages.ts`;
  deterministic role order stays in `orchestration-engine.ts`.
- Shared cross-cutting logic location: main-agent loop control lives in the new
  step-loop owner.
- Local framework / state machine / projection / validation / gate avoided:
  no new persisted runtime framework, no Workbench projection, no new gate.
- Future-cost reduction for similar features: later WorkflowPlan/TaskGraph or
  scheduler integration can plug into observe/decide boundaries without
  reintroducing hidden fixed sequences.

## Planning-Discovered Gaps

- Subagent review identified rework semantics as the primary risk: top-level
  automatic rework and TaskRun bounded-rework retry must remain separate.
- Subagent review also identified duplicate evidence writing as a risk; V1
  record must be state threading only.

