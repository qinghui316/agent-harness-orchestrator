# Plan: main-agent-loop-projection-retirement-v6

## Approach

Perform a narrow symbol-scoped deletion of the old projection seam. Keep the
canonical Goal Loop evidence and main-agent orchestration evidence owners
intact, then add retirement tests and handoff docs so future work does not
reintroduce the DTO field.

## Steps

1. Remove the Goal Loop projection module and manager re-export.
2. Remove Workpad read-model imports/helpers/return fields for
   `mainAgentLoopProjection`.
3. Remove backend and frontend DTO declarations for `MainAgentLoopProjection`.
4. Delete the old projection unit test and update Workbench/module-boundary
   tests to assert retirement instead of non-executing retention.
5. Update `AGENTS.md`, `docs/STATUS.md`, and
   `docs/CURRENT-DEVELOPMENT-PLAN.md` to mark V6 complete/current.
6. Run targeted and standard verification, then close/archive the structured
   change.

## Decisions

- Retire rather than boundaryize the projection. The projection was not durable
  truth and duplicated current Goal Loop/replay paths.
- Do not delete Goal Loop capabilities, action bridge request ids, or
  main-agent orchestration evidence. They are the current architecture, not
  this old seam.
- Keep historical archive text unchanged.

## Minimality Gate Plan

- Can this be a no-op: no; public Workpad/Web DTO still exposes the retired
  seam.
- Reuse: existing Goal Loop summary and main-agent orchestration evidence owners
  remain; no replacement projection is added.
- Shared root fix: delete the source projection module and DTO fields rather
  than hiding only individual UI consumers.
- Avoided: no new projection, state machine, action, scheduler bridge, or UI
  surface.
- Smallest coherent change: one seam deletion plus tests/docs that prove the
  current owners remain.

## Module Boundary Plan

- Owner module: old owner was `src/goal-loop/main-agent-loop-projection.ts`; it
  is removed.
- New / moved responsibilities: none. Goal Loop summaries and main-agent
  orchestration evidence keep their existing owners.
- Facade touch points: remove the manager re-export and Workpad/Web DTO fields.
- Forbidden write-back locations: no source roots, SQLite, Scheduler,
  IntegrationCheck, confirmationQueue, action registry, automation allowlist,
  apply/close, or Harness evolution writes.
- Compatibility surface: Workbench server and Web client are versioned together
  locally; Workpad snapshots are derived DTOs, not persisted truth.
- Boundary tests: module-boundary greps assert no production seam remains and
  old runners/action aliases do not regress.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: current Goal Loop summary and
  main-agent orchestration evidence/replay/policy/backflow remain the only
  supported paths.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is proposed.
- Domain-specific logic location: unchanged in Goal Loop and
  `main-agent-orchestration` owners.
- Shared cross-cutting logic location: unchanged.
- Local framework / state machine / projection / validation / gate avoided:
  this change deletes a projection instead of creating another one.
- Future-cost reduction for similar features: fewer duplicate read paths and
  less risk of user-visible "main-agent judgment" cards resurfacing.

## Planning-Discovered Gaps

None yet.
