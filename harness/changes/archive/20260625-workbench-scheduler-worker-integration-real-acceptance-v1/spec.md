# Spec: workbench-scheduler-worker-integration-real-acceptance-v1

## Goal

Verify the real Workbench scheduler worker / integration path after the latest
low-conflict TaskGraph reachability change, using an E-drive sandbox with source
dependencies installed.

## Users

- A local developer using Workbench as the primary demand conversation surface.
- Future AHO agents deciding whether scheduler worker execution is ready for a
  wider Goal-driven loop slice.

## Acceptance Criteria

- AC-001: A fresh external E-drive source project is prepared with dependencies
  installed, and the source repo is clean before Workbench acceptance starts.
- AC-002: The Workbench UI creates or opens an ordinary demand whose accepted
  plan has two explicit, independent source scopes.
- AC-003: After manual planning confirmation, `完全访问权限` may progress only
  through Goal Loop preparation and the existing controlled scheduler path; raw
  `planning.scheduler.*` actions are not directly auto-consumed.
- AC-004: The scheduler worker path reaches a real worker `coder-codex` run, or
  records the first real blocker before worker execution with accurate
  classification.
- AC-005: Worker validation/audit and integration candidate / IntegrationCheck
  progression are recorded if reachable; otherwise the next blocker is recorded
  with artifact evidence.
- AC-006: The source root is not mutated by AHO before a human apply/merge
  confirmation, and this change does not auto-apply, close, merge, remote-land,
  or run Harness evolution.
- AC-007: If product code changes are needed, the fix is placed in the
  appropriate owner module and covered by targeted tests plus required project
  verification.

## Non-Goals

- Full parallel executor, simultaneous wave dispatch, slot allocator, child
  Change creation, automatic apply/close/merge, remote landing, Harness
  evolution auto-apply.
- A new scheduler framework, new automation permission system, new projection
  system, or new evidence family.
- AHO-owned automatic dependency installation.

## Constraints

- Use `E:\aho-accept\scheduler-worker-v1\src` and
  `E:\aho-accept\scheduler-worker-v1\home`; do not use C-drive acceptance
  directories.
- Keep `README.md` untracked and unrelated.
- Treat Codex as a real external executor; do not use fake binaries, mocked
  PATH, fixture results, or hand-written run artifacts as acceptance evidence.
- High-impact terminal gates remain human-confirmed.

## Risks

- Real Codex may produce an agent-quality failure; route through existing
  bounded rework only when the current gate allows it.
- Validation/audit/integration may expose a product bug; fix the owner path
  rather than adding explanation layers.
- Environment/auth/provider failures are valid blocker evidence and must not be
  reported as product success.
