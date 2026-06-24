# Spec: workbench-scheduler-integrationcheck-real-acceptance-v1

## Goal

Prove, through real Workbench UI and external E-drive source isolation, that the existing scheduler IntegrationCheck handoff can continue from a ready scheduler integration candidate into real aggregate validation/audit and then stop at an existing human apply/discard gate, or record the next blocker without fake pass evidence.

## Users

- AHO product users who expect low-conflict scheduler worker outputs to be combined safely before any source mutation.
- Future AHO agents that need accurate handoff evidence about whether scheduler integration is product-usable past the candidate stage.

## Acceptance Criteria

- AC-001: A fresh E-drive sandbox is used as the managed source and runtime home; the AHO development checkout is not the managed project.
- AC-002: The Workbench browser UI reaches a ready scheduler integration candidate through ordinary demand, manual planning/readiness confirmation, and scoped `完全访问权限`.
- AC-003: `planning.scheduler.integration-check.run` is confirmed manually, not through scoped automation or raw scheduler allowlist expansion.
- AC-004: The run records SchedulerIntegrationCandidate, SchedulerIntegrationCheckHandoff, IntegrationCheck id/status, aggregate validation/audit, and any `fixAttempts`.
- AC-005: The final Workbench visible primary gate is either the existing human apply/discard gate or a clear blocker with product/environment/agent-quality classification.
- AC-006: The external source root is not mutated before an explicit human apply gate; this change does not auto apply/close/merge.
- AC-007: If product code changes are needed, they are limited to the owner module that caused the blocker and covered by targeted tests.

## Non-Goals

- Implement full parallel execution, scheduler loops, slot allocation, or whole-wave dispatch.
- Add raw `planning.scheduler.*` actions to scoped automation.
- Automatically apply, close/archive, merge, push, remote-land, or run Harness evolution.
- Add new evidence-only abstraction layers.

## Constraints

- Use E-drive acceptance paths only.
- Keep `README.md` untracked and out of scope.
- Reuse existing IntegrationCheck, aggregate validation/audit, bounded IntegrationFix, scheduler handoff, Workbench projection, and source-apply safety mechanisms.
- High-impact source mutation gates remain human-confirmed.

## Risks

- Real Codex output may fail or produce incompatible worker diffs; classify as agent-quality or validation/audit failure and continue only through existing legal gates.
- External dependency setup may fail; classify as environment blocker.
- IntegrationCheck may expose a projection/action payload gap; fix only the relevant owner path.
