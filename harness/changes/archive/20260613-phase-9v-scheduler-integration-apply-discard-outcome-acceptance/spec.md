# Spec: Phase 9V Scheduler Integration Apply Discard Outcome Acceptance

## Goal

Prove and harden the scheduler integration handoff boundary after multiple scheduler worker outputs have passed quality gates: the scheduler may hand ready worktrees to the existing IntegrationCheck path, but source-root mutation remains exclusively under the existing `apply-check.apply` / `apply-check.discard` human confirmation queue. Scheduler outcome reconciliation records what that existing gate did; it must not become a second apply/discard authority.

## Users

- Primary: a developer using the AHO Workbench main-agent conversation to prepare and execute scoped scheduler worker slices.
- Secondary: future agents maintaining scheduler runtime code who need direct-call guards to be as strict as Workbench stale-target revalidation.

## Acceptance Criteria

- AC-001: Docs accurately record Phase 9U archived and Phase 9V active, with no stale Phase 9U active claim.
- AC-002: `reconcileSchedulerIntegrationOutcome()` re-reads latest `SchedulerIntegrationCandidate` and rejects stale, forged, cross-change, or target-mismatched handoff/candidate lineage before reading outcome targets.
- AC-003: Scheduler IntegrationCheck `passed` state still surfaces existing `apply-check.apply` / `apply-check.discard` confirmation, not a scheduler-owned apply/discard action.
- AC-004: After existing `apply-check.apply`, scheduler outcome reconcile records `applied` only when every target worktree has applied evidence.
- AC-005: After existing `apply-check.discard`, scheduler outcome reconcile records `discarded` only when no target has applied evidence.
- AC-006: Terminal IntegrationCheck failure/conflict/validation/audit statuses remain `blocked` scheduler outcomes.
- AC-007: Outcome reconciliation creates no worker, validation/audit, IntegrationCheck, apply/discard, landing, PR, merge, child Change, scheduler loop, slot allocation, or full parallel executor behavior.
- AC-008: Main logic remains in `src/scheduler-runtime/integration-outcome.ts`; Workbench/server/frontend remain thin dispatch/projection surfaces.
- AC-009: Full product and Harness verification pass, or pre-existing failures are recorded.

## Non-Goals

- Add a new Workbench action.
- Add a scheduler-specific apply or discard command.
- Change IntegrationCheck artifact paths, JSON shapes, status values, apply/discard semantics, confirmation queue public shape, SSE, or thread storage.
- Start additional scheduler workers or proceed to landing/PR/merge.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run/Validation/Audit, existing IntegrationCheck evidence, and human apply/close gates.
- Reference projects are boundary inspiration only: Symphony's reconcile idea maps to evidence recording, ODWF's journal idea maps to typed artifacts, and AgentScope's session/event model does not replace AHO human gates.
- `README.md` remains unrelated and untracked.

## Risks

- The acceptance path is relatively long because it drives two scheduler workers through Workbench and existing fake Codex fixtures.
- A too-broad fix could accidentally create a scheduler-owned apply/discard authority; this phase must stay read/record only after existing gates run.

