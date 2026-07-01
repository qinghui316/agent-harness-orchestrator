# Plan: main-agent-controlled-scheduler-integrationcheck-backflow-v1c

## Approach

Follow the existing V1a/V1b backflow pattern: add one focused read-only owner,
use existing repository readers, attach the summary under
`controlledSchedulerStateBackflow`, and let replay/policy consume only bounded
health/gap information.

## Steps

1. Add `controlled-scheduler-integration-backflow.ts` with bounded summary,
   lineage checks, health classification, and empty/degraded helper.
2. Wire the summary into controlled Scheduler state backflow and replay
   evidence health.
3. Add focused unit tests for happy path, unsafe missing exact IntegrationCheck,
   stale/scope lineage, closeout conflicts, and no executable payloads.
4. Add module-boundary assertions proving the owner stays read-only.
5. Update review, verification, and handoff docs before close.

## Decisions

- Use source name `controlled-scheduler-integration` for replay health.
- Missing exact IntegrationCheck after a handoff/outcome is unsafe and should be
  classified as `stale`, not ordinary `missing`.
- `passed` IntegrationCheck is not completion; apply/discard remains an external
  human gate.

## Minimality Gate Plan

- Can this be a no-op: no; replay currently observes Scheduler state and worker
  posture but not IntegrationCheck terminal lineage.
- Reuse: existing Scheduler strict readers, IntegrationCheck repository,
  replay health/gap mechanism, and decision policy unsafe-gap handling.
- Shared root fix: attach to controlled Scheduler state backflow instead of
  adding a separate policy or UI path.
- Avoided: new Scheduler gate, action bridge, UI panel, local state machine, or
  execution owner.
- Smallest coherent change: one read-only owner plus replay wiring and tests.

## Module Boundary Plan

- Owner module: `src/main-agent-orchestration/controlled-scheduler-integration-backflow.ts`.
- New / moved responsibilities: bounded read-only summary of Scheduler
  IntegrationCheck terminal lineage.
- Facade touch points: controlled Scheduler state backflow and replay summary.
- Forbidden write-back locations: Workbench action handlers, Scheduler runtime
  executors, IntegrationCheck manager/apply-discard/service, confirmation queue,
  automation allowlist, apply/close.
- Compatibility surface: existing replay summary gains a nested optional-shaped
  field through controlled state backflow; no UI/action behavior changes.
- Boundary tests: module-boundary source assertions for read-only imports and
  forbidden execution calls.
- Follow-up split candidates: none.
- If not applicable, reason: TBD.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: replay health/gaps, controlled
  Scheduler state backflow, Scheduler repository strict readers, exact
  IntegrationCheck repository reads.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing state/worker summaries do not cover IntegrationCheck terminal chain.
- Domain-specific logic location: lineage checks in the new integration backflow
  owner.
- Shared cross-cutting logic location: replay health/gap handling and decision
  policy unsafe-gap handling stay shared.
- Local framework / state machine / projection / validation / gate avoided: no
  action/gate/recovery framework is added.
- Future-cost reduction for similar features: main-agent policy can observe the
  whole controlled Scheduler path through one replay summary instead of each
  future consumer reading Scheduler artifacts directly.
- If not applicable, reason: TBD.

## Planning-Discovered Gaps

None yet.

