# Plan: workbench-goal-loop-decision-surface-audit-v1

## Approach

Audit first, then repair only proven gaps. The existing Goal Loop chain already
contains decision, packet, controller, preflight, projection, and controlled
continuation owners. The smallest coherent implementation is to fix handoff
drift, run targeted surface tests, and only edit product code if the audit
proves the user surface is misleading.

## Steps

1. Update active change artifacts and handoff direction to name this audit.
2. Inspect existing Goal Loop, Workbench read-model, confirmation queue,
   decision inspector, and scoped automation boundaries.
3. Run targeted audit suites for Goal Loop decisions, Workbench Goal Loop
   projection, read-model, automation, and DOM surface.
4. If tests reveal a gap, patch the narrow owner: read-model/copy, confirmation
   queue alignment, current-gate revalidation, or automation UI eligibility.
5. Update review evidence, close handoff docs, run Harness checks, and close the
   change.

## Decisions

- Do not add a new next-step decision engine; `GoalLoopDecision` already owns
  the decision artifact.
- Do not make Goal Loop own ordinary `code.run` or planning/decomposition paths;
  those remain existing Workbench gates.
- Treat Open Dynamic Workflows and Symphony as reference evidence for artifact +
  leaf execution and orchestrator reconcile/dispatch, not as dependencies or
  implementation instructions.

## Minimality Gate Plan

- Can this be a no-op: yes for product code if the audit passes.
- Reuse: existing `src/goal-loop/*`, Workbench read-model confirmation owners,
  current-gate revalidation, and `src/automation-runtime/policy.ts`.
- Shared root fix: check goal-loop projection, confirmation queue promotion,
  decision inspector selection, and DecisionPanels full-access eligibility
  before adding any local guard.
- Avoided: new decision runtime, local framework, evidence family, permission
  system, scheduler executor, or future-only branch.
- Smallest coherent change: handoff drift fix plus targeted audit evidence; only
  patch the narrow owner if evidence shows a real surface mismatch.

## Module Boundary Plan

- Owner module: existing Goal Loop, Workbench read-model/confirmation, and
  automation policy owners only.
- New / moved responsibilities: none planned.
- Facade touch points: none planned; no new main logic in broad facades.
- Forbidden write-back locations: workflow truth, source apply, scheduler
  runtime, automation runtime, and server action handlers unless a targeted gap
  proves that owner is responsible.
- Compatibility surface: no schema/API changes planned.
- Boundary tests: targeted goal-loop/read-model/DOM/automation suites.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Goal Loop decision artifacts,
  controller gate parity, preflight, confirmation queue, decision inspector,
  scoped automation allowlist, and Workbench copy helpers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is currently proposed.
- Domain-specific logic location: existing read-model/copy owners if needed.
- Shared cross-cutting logic location: existing current-gate revalidation and
  workflow action target validation if needed.
- Local framework / state machine / projection / validation / gate avoided: yes.
- Future-cost reduction for similar features: future Goal Loop surface work
  starts from an audit matrix instead of adding another explanation layer.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.
