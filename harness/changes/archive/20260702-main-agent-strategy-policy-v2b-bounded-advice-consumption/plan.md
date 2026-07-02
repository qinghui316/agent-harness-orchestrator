# Plan: main-agent-strategy-policy-v2b-bounded-advice-consumption

## Approach

Extend the existing strategy policy owner instead of adding a second
controller. `MainAgentStrategyAdvice` remains schema-validated read-only input;
V2b adds a bounded consumption step that can select the final strategy kind
only when deterministic current-state evidence allows it. Strategy consumption
and automation remain downstream safety checks, not advice consumers.

## Steps

1. Add `MainAgentStrategyAdviceConsumption` types and
   `consumeMainAgentStrategyAdvice(...)`.
2. Preserve deterministic baseline in `MainAgentStrategyDecision` and add
   final kind provenance.
3. Gate advice consumption by evidence envelope:
   stale/unsafe/blocked first, deterministic parallel only, terminal evidence
   required for complete, no executable payloads.
4. Keep request-approval and full-access semantics unchanged except that they
   read the final strategy kind already produced by the safe policy.
5. Add unit and boundary tests, update docs/handoff, verify, close, and commit.

## Decisions

- Decision outlet: keep `deriveStrategyDecision(...)` as the only strategy
  outlet.
- Advice source: no runtime LLM call in V2b; tests pass explicit advice input.
- Final-kind source values: deterministic baseline, bounded advice, or rejected
  advice.
- Complete acceptance: only current completed posture or terminal result-gate
  evidence can accept terminal advice.

## Minimality Gate Plan

- Can this be a no-op: no; V2a intentionally records advice but never consumes
  it, so V2b needs a bounded consumption contract.
- Reuse: existing strategy policy, advice schema validator, strategy
  consumption, scoped automation revalidation, and module-boundary tests.
- Shared root fix: implement in strategy policy rather than automation handler
  or Workbench UI.
- Avoided: no new durable ledger, action type, UI, runner, scheduler path, or
  allowlist.
- Smallest coherent change: consume advice only inside strategy policy and keep
  downstream execution unchanged.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/decision-policy.ts` with advice
  validation in `strategy-advice.ts`.
- New / moved responsibilities: bounded advice consumption, final-kind
  provenance, and evidence-envelope rejection.
- Facade touch points: `src/main-agent-orchestration/index.ts` exports any new
  types/helpers needed by tests and future callers.
- Forbidden write-back locations: Workbench UI/action handlers,
  confirmationQueue, automation allowlist, Scheduler/IntegrationCheck
  executors, terminal, apply/close.
- Compatibility surface: existing deterministic callers without
  `strategyAdviceInput` keep behavior.
- Boundary tests: module-boundary source assertions plus strategy/automation
  tests.
- Follow-up split candidates: Goal-style autonomous loop runner acceptance.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: deterministic strategy decision,
  read-only advice schema, strategy consumption, scoped automation and
  current-gate revalidation.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  V2a could only attach ignored/read-only advice; it had no safe final-kind
  provenance.
- Domain-specific logic location: main-agent strategy policy.
- Shared cross-cutting logic location: no new cross-cutting framework.
- Local framework / state machine / projection / validation / gate avoided:
  no new gate, runner, UI, or durable projection.
- Future-cost reduction for similar features: later LLM policy work can consume
  the same bounded evidence envelope instead of adding another controller.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

