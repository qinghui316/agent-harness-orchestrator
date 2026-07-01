# Plan: main-agent-old-seam-retirement-v5d-inbound-only-action-alias-finalization

## Approach

Use the existing main-agent execution normalizer as the compatibility owner.
Do not introduce a new action framework. Keep legacy ids registered as inbound
aliases, remove or restrict the reverse legacy conversion helper, and add tests
that distinguish generated outbound payloads from historical echo evidence.

## Steps

1. Update the main-agent execution helper so canonical normalization remains
   public, while reverse legacy conversion is removed or clearly test-only.
2. Strengthen workflow action tests for canonical/legacy routing, live registry
   membership, and high-impact/revalidated exclusions.
3. Strengthen Workbench service tests for legacy inbound
   started/completed/decision/result echo semantics.
4. Strengthen module-boundary tests to prove new outbound payloads are
   canonical, legacy strings are limited to compatibility surfaces, and
   production code cannot import a reverse legacy conversion helper.
5. Update current handoff docs and active change review evidence.

## Decisions

- Keep `role.pipeline.*` aliases permanently inbound-only for now. Do not
  delete registry/live/handler alias entries in V5d.
- Historical echo keeps the original inbound `request.actionType`; it is
  evidence, not new outbound payload generation.
- `MainAgentLoopProjection` retirement remains a separate follow-up.

## Minimality Gate Plan

- Can this be a no-op: no; V5c left alias deletion vs inbound-only undecided.
- Reuse: existing `main-agent-execution` helper, workflow registry, action
  service, labels, summaries, and boundary tests.
- Shared root fix: centralize semantics at the helper/registry/test boundary
  instead of local guards in UI or service code.
- Avoided: no new action registry, migration runner, UI, permission model, or
  projection.
- Smallest coherent change: tests plus removing/restricting a reverse legacy
  helper.

## Module Boundary Plan

- Owner module: `src/workflow-actions/main-agent-execution.ts`.
- New / moved responsibilities: none; only tighten alias semantics.
- Facade touch points: workflow registry and Workbench action handler alias map.
- Forbidden write-back locations: Workbench UI, confirmationQueue, automation
  allowlist, Scheduler, IntegrationCheck, apply/close, remote/PR/merge.
- Compatibility surface: `role.pipeline.*` inbound registry/live/handler aliases
  and historical echo records.
- Boundary tests: source scans for legacy literals, reverse-helper imports,
  generated outbound payloads, automation/high-impact/revalidation exclusions.
- Follow-up split candidates: `MainAgentLoopProjection` retirement.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: normalizer, registry, handler map,
  service echo behavior, action labels, action summaries.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism proposed.
- Domain-specific logic location: main-agent execution helper.
- Shared cross-cutting logic location: workflow action tests and module-boundary
  tests.
- Local framework / state machine / projection / validation / gate avoided:
  all avoided.
- Future-cost reduction for similar features: future agents can see canonical
  outbound versus inbound compatibility in one place.

## Planning-Discovered Gaps

None. Subagent review approved the direction and required only clearer
historical echo and reverse-helper boundaries.
