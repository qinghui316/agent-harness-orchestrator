# Spec: workbench-local-scheduler-terminal-path-real-ui-scout-v1

## Goal

Prove that the local scheduler terminal path works as one real Workbench UI
flow, not only as separately validated slices. The path should start from an
ordinary low-conflict demand, enter scheduler execution only through the
existing controlled wrapper, reach manual IntegrationCheck, then complete local
integration apply, landing, and close/archive or record a precise blocker.

## Users

- Local individual developer using Workbench as the primary product surface.
- Future agent maintainers deciding whether local Agent Loop MVP architecture is
  complete enough to shift from architecture work to product polish or the next
  explicit parallel-executor design.

## Acceptance Criteria

- AC-001: Workbench real UI can open an E-drive external project and create a
  low-conflict two-file demand.
- AC-002: Codex Plan Mode planning is human-confirmed before execution, and
  `完全访问权限` only applies after that plan confirmation.
- AC-003: Full-access reaches scheduler work only through
  `planning.goal-loop.controlled-continue.run` / existing controlled scheduler
  wrapper, not raw `planning.scheduler.*`.
- AC-004: Same-Change worker worktrees produce Codex, validation, and audit
  evidence and a ready `SchedulerIntegrationCandidate`, or a precise blocker.
- AC-005: Workbench stops at the manual
  `planning.scheduler.integration-check.run` gate.
- AC-006: Manual IntegrationCheck produces aggregate validation/audit evidence
  and a real integration apply/discard gate or a precise blocker.
- AC-007: Manual integration apply mutates only the external source root after
  human confirmation and then no longer shows stale integration apply/discard as
  current primary.
- AC-008: Local `landing.prepare` and `change.close/archive` are reachable after
  integration apply, or a precise local blocker is recorded.
- AC-009: No PR, remote, merge, raw scheduler full-access, automatic
  IntegrationCheck, automatic integration apply/discard, central workflow DB, or
  Harness evolution automation is introduced.

## Non-Goals

- Implementing a full parallel executor, scheduler loop, slot allocator, or
  child Change model.
- Adding a central workflow database; Workbench SQLite remains
  interaction/projection storage only.
- Implementing or accepting PR/remote/merge behavior.
- Broadening scoped `完全访问权限` beyond current local boundaries.

## Constraints

- Real acceptance uses `E:\aho-accept\local-scheduler-terminal-v1\src` and
  `E:\aho-accept\local-scheduler-terminal-v1\home`.
- The AHO development checkout must not be used as the managed source project.
- If code changes are required, they must be minimal and owned by the existing
  relevant module: Workbench projection/revalidation, scheduler,
  IntegrationCheck, landing/close, or automation stop reason.
- `README.md` remains unrelated and untracked.

## Risks

- Real Codex output may produce an agent-quality failure; that should route
  through existing bounded rework/fix paths or be recorded, not hand-applied.
- External sandbox dependencies or provider/auth issues may block acceptance;
  record them as environment blockers, not product success.
- A composed path may expose stale gate projection after a terminal action; fix
  only the existing projection/confirmation owner if that occurs.
