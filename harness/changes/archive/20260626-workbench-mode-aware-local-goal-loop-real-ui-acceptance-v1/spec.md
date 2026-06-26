# Spec: workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1

## Goal

Prove through the real Workbench UI that the mode-aware local Goal Loop behaves
correctly for both execution modes:

- `请求批准`: observes the same local loop and waits at each real primary gate.
- `完全访问权限`: after human plan confirmation, automatically consumes only the
  selected Change's allowed local gates and stops at completion or a real
  blocker.

## Users

- Local AHO user validating that ordinary Workbench demand execution can be
  controlled by a simple two-mode choice without understanding internal ECL,
  Scheduler, Goal Loop, or TaskGraph terms.
- Future agent/operator reading archive evidence to decide whether local loop
  UI acceptance has actually passed.

## Acceptance Criteria

- AC-001: A fresh E-drive external sandbox can be opened in Workbench through
  the real in-app browser without using the AHO development checkout as the
  managed source.
- AC-002: In `请求批准` mode, after human plan confirmation, Workbench does not
  auto-dispatch the next local action and shows exactly one real primary gate.
- AC-003: In `完全访问权限` mode, after human plan confirmation, Workbench
  automatically advances through allowed local gates and records automation
  run evidence.
- AC-004: Full-access does not auto-run plan confirmation, raw scheduler,
  manual IntegrationCheck, integration apply/discard, PR, remote, merge, push,
  or Harness evolution.
- AC-005: Source root safety is recorded before and after any local apply; the
  external source is not mutated before the relevant local apply gate.
- AC-006: The final UI state is closed/archive, completed/no primary gate, or a
  clear blocker with owner classification.
- AC-007: If a product blocker is found, the fix stays in the existing owner
  path and does not introduce a new runtime, permission system, projection
  framework, or evidence family.

## Non-Goals

- Implementing a new Goal Loop runtime.
- Expanding `完全访问权限` beyond selected-Change local gates.
- Implementing full parallel executor, scheduler loop, child Change creation,
  PR/remote/merge, or Harness evolution automation.
- Claiming server/API-only evidence as real UI acceptance.

## Constraints

- Use `E:\aho-accept\mode-aware-loop-real-ui-v1\src` and
  `E:\aho-accept\mode-aware-loop-real-ui-v1\home`.
- Keep unrelated untracked `README.md` out of this change.
- Prefer acceptance/no-code close if the UI path passes.
- If code changes are required, start from the touched owner and run targeted
  tests before aggregate checks.

## Risks

- Real Codex may produce low-quality candidate code; classify as agent-quality
  or use existing bounded rework rather than faking a pass.
- Provider/auth/environment issues may block real acceptance; record them as
  environment blockers and keep mechanical validation separate.
- If browser or Workbench startup fails, do not substitute API-only evidence
  for UI acceptance.
