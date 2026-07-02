# Plan: main-agent-strategy-policy-v2a-stale-first-readonly-advice

## Approach

Repair the existing resume-consumption owner first, then add the smallest
read-only strategy-advice contract. V2a must make advice inspectable without
letting it drive automation, confirmation, Scheduler, IntegrationCheck, or
apply/close behavior.

## Steps

1. Reorder `assessMainAgentResumeConsumption(...)` so stale/scope drift wins
   before blocked/explain/allow states.
2. Add strict `MainAgentStrategyAdvice` validation and ignored-advice helpers
   near the main-agent strategy policy owner.
3. Attach bounded advice metadata without changing deterministic strategy
   decisions or scoped automation compatibility.
4. Update boundary docs and tests for stale-first behavior, invalid advice, and
   no new execution authority.

## Decisions

- Advice is read-only metadata in V2a. It cannot alter
  `MainAgentStrategyDecision.kind`, full-access compatibility, or current-gate
  execution.
- LLM calls are not implemented in V2a; schema/merge boundaries are prepared
  first.
- Stale/scope mismatch has higher priority than blocked/explain-only posture.

## Minimality Gate Plan

- Can this be a no-op: no; V1c has a concrete stale/blocked ordering bug.
- Reuse: reuse existing strategy-consumption, decision-policy, replay summary,
  and module-boundary tests.
- Shared root fix: fix the shared resume-consumption assessor instead of
  patching automation callers.
- Avoided: no new durable advice JSONL, no new controller, no new action type,
  no UI, no allowlist changes.
- Smallest coherent change: ordering fix plus read-only advice contract and
  tests.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/`.
- New / moved responsibilities: bounded advice validation under main-agent
  strategy policy; no execution ownership moves.
- Facade touch points: `src/main-agent-orchestration/index.ts` re-exports types
  and helpers only.
- Forbidden write-back locations: Workbench UI, action handlers, confirmation
  queue, automation policy, Scheduler runtime, IntegrationCheck, apply/close.
- Compatibility surface: existing `MainAgentStrategyDecision` remains the
  deterministic consumer-facing strategy decision.
- Boundary tests: module-boundary greps for imports and forbidden payload /
  controller use.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: deterministic strategy decision,
  scoped automation consumption, replay gaps, and Harness gate revalidation.
- Why new mechanism is needed: LLM advice needs a strict typed quarantine before
  any future consumption can be considered.
- Domain-specific logic location: main-agent strategy policy modules.
- Shared cross-cutting logic location: none added.
- Local framework / state machine / projection / validation / gate avoided: no
  additional runner, projection, or gate.
- Future-cost reduction: V2b can evaluate advice consumption against a bounded
  contract instead of ad hoc prompt output.

## Planning-Discovered Gaps

None.
