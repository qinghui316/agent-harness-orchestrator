# Plan: main-agent-old-seam-retirement-v4-canonical-payload-default-audit

## Approach

Use the existing `main-agent-execution` helper as the sole compatibility owner.
Audit production action payload paths and enforce a whitelist for legacy
`role.pipeline.*` string occurrences. Convert any outbound generator that still
uses legacy ids to canonical `main-agent.execution.*`, while keeping legacy ids
registered and routable.

## Steps

1. Inspect all production occurrences of `role.pipeline.*`,
   `main-agent.execution.*`, `rolePipeline`, and `MainAgentLoopProjection`.
2. Add or tighten helper/boundary tests that encode the legacy inbound-only
   whitelist.
3. Apply minimal code changes if any outbound production payload still emits
   legacy ids.
4. Update `AGENTS.md`, `docs/STATUS.md`, and
   `docs/CURRENT-DEVELOPMENT-PLAN.md` for the V4 handoff.
5. Run targeted and standard verification, then record review and closeout
   evidence.

## Decisions

- Keep `role.pipeline.*` registry and handler aliases in V4.
- Keep `rolePipeline` and `MainAgentLoopProjection` unchanged in V4.
- Treat canonical outbound enforcement as a boundary/test concern, not a new
  execution layer.

## Minimality Gate Plan

- Can this be a no-op: no; V3 created aliases, but no guard prevents new code
  from emitting legacy ids.
- Reuse: existing `workflow-actions/main-agent-execution` helper and registry
  compatibility are reused.
- Shared root fix: centralize checks in helper/boundary tests rather than local
  `startsWith("role.pipeline.")` branches.
- Avoided: no new action family, permission system, projection, or runner.
- Smallest coherent change: tests plus only necessary outbound payload fixes.

## Module Boundary Plan

- Owner module: `src/workflow-actions/main-agent-execution.ts`.
- New / moved responsibilities: none; V4 only strengthens canonical/legacy
  classification.
- Facade touch points: action registry and Workbench handler alias map remain
  compatibility facades.
- Forbidden write-back locations: confirmation queue, Goal Loop, Scheduler,
  IntegrationCheck, automation allowlist, apply/close.
- Compatibility surface: `role.pipeline.*` inbound aliases remain registered and
  executable.
- Boundary tests: legacy action occurrence whitelist and no automation/GoalLoop
  expansion.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: `normalizeMainAgentExecutionAction`,
  `isMainAgentExecutionAction`, and shared label/result helpers.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: main-agent execution action helper.
- Shared cross-cutting logic location: registry/handler aliases and boundary
  tests.
- Local framework / state machine / projection / validation / gate avoided: yes.
- Future-cost reduction for similar features: future migrations can forbid
  legacy outbound ids with one whitelist test.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None.
