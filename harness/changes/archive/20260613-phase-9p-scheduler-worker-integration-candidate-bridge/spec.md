# Spec: Phase 9P Scheduler Worker Integration Candidate Bridge

## Goal

Scheduler worker and scheduler rework worker paths can now reach audited, quality-gated outputs, but those outputs are still scheduler-runtime evidence. AHO needs a scoped bridge back to the existing multi-worktree integration chain without letting scheduler evidence bypass apply readiness, IntegrationCheck, aggregate validation/audit, or human apply gates.

## Users

- Main Agent: can explain which scheduler worker outputs are integration candidates.
- User: sees whether enough scheduler outputs exist for a future integration check without seeing internal scheduler runtime artifacts as execution controls.
- Future scheduler executor: receives durable evidence for which completed worker worktrees can be considered by the existing merge-safety chain.

## Acceptance Criteria

- AC-001: Docs record Phase 9O archived and Phase 9P active.
- AC-002: `planning.scheduler.integration-candidate.compile` requires `changeId + schedulerRunId` and preserves full scheduler evidence ids.
- AC-003: Original scheduler audit `approved` / `approved-with-notes` can become candidate output after apply readiness recheck.
- AC-004: Rework scheduler audit `approved` / `approved-with-notes` can become candidate output after apply readiness recheck.
- AC-005: Missing, blocked, failed, forged, stale, or cross-change evidence does not become ready output.
- AC-006: Original approved plus rework approved for the same `claimIntentId` records a blocked inconsistency.
- AC-007: Apply preview/readiness failure, source drift, or already-applied worktree records blocked output.
- AC-008: Fewer than two ready targets shows waiting summary and no IntegrationCheck/apply/merge controls.
- AC-009: The phase creates no execution/runtime artifacts and starts no worker, validation, audit, rework, IntegrationCheck, apply, or merge flow.
- AC-010: New scheduler-runtime modules do not depend on Workbench, server, web, CLI command modules, or broad facades.

## Non-Goals

- No IntegrationCheck execution.
- No source-root apply, landing, PR, merge, or remote handoff.
- No next-worker, whole-wave, slot allocator, scheduler loop, or parallel executor.
- No new worktree/run/WorkerLease/WorkerSession/RuntimeWorkspace/EventSource.
- No change to existing IntegrationCheck artifact shape or apply behavior.

## Constraints

- `README.md` remains unrelated and untracked.
- Use existing apply readiness and worktree metadata guards.
- Keep main implementation in `src/scheduler-runtime/`.
- Do not write scheduler bridge logic into Workbench chat, server route, frontend shell, or CLI modules.

## Risks

- Candidate compilation could accidentally look like IntegrationCheck readiness. Mitigation: explicit waiting state when ready target count is below two and no IntegrationCheck/apply controls.
- Rework and original outputs for the same claim can conflict. Mitigation: blocked inconsistency instead of silent choice.
- Scheduler evidence might drift from worktree/source state. Mitigation: re-run existing apply preview/readiness gate during compile.
