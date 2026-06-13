# Spec: Phase 9Q Scheduler IntegrationCheck Handoff

## Goal

Add a scheduler-owned handoff gate from `SchedulerIntegrationCandidate` to the existing IntegrationCheck chain. When the latest scheduler integration candidate has at least two ready worktree targets, the user can confirm a scheduler-scoped IntegrationCheck handoff. The handoff must re-read scoped evidence, verify the candidate has not drifted, pass the exact candidate worktree ids to `runIntegrationCheck(project, worktreeIds)`, and write scheduler-owned handoff evidence.

The goal is to reconnect scheduler worker/rework outputs to AHO's existing multi-worktree safety chain, not to create a new integration engine or apply authority.

## Users

- Primary: the developer using Workbench to review a scheduler-prepared parallel work result.
- Secondary: future agents and auditors that need durable evidence linking scheduler worker outputs to an IntegrationCheck artifact.

## Acceptance Criteria

- AC-001: Docs record Phase 9P archived and Phase 9Q active, with no stale Phase 9P active/current claim.
- AC-002: `SchedulerIntegrationCheckHandoff` evidence is owned by `src/scheduler-runtime/` and records `changeId`, `schedulerRunId`, `schedulerRuntimeStateId`, `schedulerClaimReservationId`, `schedulerIntegrationCandidateId`, exact ready worktree ids, candidate ready target hashes/source heads, IntegrationCheck id/status, and artifact refs.
- AC-003: The Workbench action requires `changeId + schedulerRunId + schedulerIntegrationCandidateId` and preserves those ids plus exact `worktreeIds` in action payload, decision/audit scope, and result metadata.
- AC-004: Handoff only accepts the latest matching `SchedulerIntegrationCandidate` for the selected Change/SchedulerRun with `status="ready"` and `readyCount >= 2`.
- AC-005: Handoff fail-closes on stale, forged, cross-change, superseded, waiting, blocked, ready target count `< 2`, duplicate worktree id, changed target diff hash, changed source head, applied/discarded/not-ready worktree, or any explicit target rejected by the existing IntegrationCheck readiness path.
- AC-006: Handoff calls existing `runIntegrationCheck(project, exactReadyWorktreeIds)` with explicit ids and never calls the automatic no-argument candidate path.
- AC-007: Phase 8D explicit `worktreeIds` all-or-nothing behavior remains intact: any bad requested id rejects the whole IntegrationCheck.
- AC-008: 9Q does not implement patch workspace, aggregate validation/audit, IntegrationFix, IntegrationCheck apply/discard, landing, PR, merge, scheduler loop, next worker, whole-wave dispatch, or full parallel executor behavior.
- AC-009: When a ready scheduler candidate exists, Workbench confirmation should expose the scheduler-scoped handoff path instead of a bypassing ordinary auto-discovered IntegrationCheck candidate for the same target set.
- AC-010: Existing IntegrationCheck result/apply confirmation behavior remains unchanged after the handoff-created IntegrationCheck exists.
- AC-011: New scheduler-runtime handoff modules do not depend on Workbench, server, web UI, CLI command modules, or broad facades.
- AC-012: Full product and Harness verification pass, or any pre-existing failure is clearly recorded.

## Non-Goals

- No new CLI API.
- No standalone HTTP route.
- No new scheduler executor, scheduler loop, slot allocator, second worker, whole wave, validation, audit, rework, worktree, run, child Change, Apply, Landing, PR, remote merge, or local merge behavior.
- No change to IntegrationCheck artifact path, JSON shape, patch artifacts, status values, aggregate validation/audit semantics, IntegrationFix attempt semantics, Workbench apply/discard confirmation queue public shape, or apply/discard behavior.
- No replacement of AHO workflow truth with scheduler evidence. `SchedulerIntegrationCheckHandoff` is bridge evidence only.

## Constraints

- Future-feature module boundary rule applies: owner module is `src/scheduler-runtime/`; Workbench/server/frontend code may only dispatch, summarize, and display.
- Use existing `runIntegrationCheck(project, worktreeIds)` and its Phase 8D explicit target all-or-nothing guard.
- Scheduler handoff cannot trust stale `SchedulerIntegrationCandidate` data alone; it must re-read current selected Change, SchedulerRun lineage, latest candidate, and target readiness before invoking IntegrationCheck.
- The action must remain high-impact and stale-revalidated.
- The ordinary integration candidate projection must not create a parallel bypass around scheduler-owned handoff evidence for scheduler-ready target sets.

## Risks

- `runIntegrationCheck(project, worktreeIds)` creates real IntegrationCheck evidence and may run aggregate validation/audit and IntegrationFix; docs and tests must not describe 9Q as merely writing a handoff marker.
- If ordinary `findIntegrationCheckCandidate(project)` still surfaces the same ready worktrees as a primary confirmation, users can bypass the scheduler handoff evidence.
- If candidate ready target hashes/source heads are not rechecked, a stale candidate could hand off a different target state.
- If duplicate or unrelated ready worktrees are silently included, scheduler evidence and IntegrationCheck evidence can diverge.
- If idempotency is not defined, repeated confirmation could create duplicate checks or confusing handoff records.
