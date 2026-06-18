# Spec: Phase 12L Scheduler Terminal Workpad Boundary Copy

## Goal

Terminal SchedulerRun Workpad cards should make their non-executing boundary visible and test-protected. A user or future agent reading the Workpad must not infer that terminal completion or blocked closeout authorizes a scheduler loop, hidden dispatch, source mutation, apply/close, or merge.

## Users

- AHO users reviewing scheduler terminal state in the Workbench.
- Future agents using Workpad UI tests and ECL review evidence to avoid turning terminal evidence into execution authority.

## Acceptance Criteria

- AC-001: The SchedulerRun completion card states that terminal completion is read-only evidence and does not authorize scheduler loop/full executor/whole-wave/slot allocation/source mutation/apply/close/PR/landing/merge/Harness evolution.
- AC-002: The SchedulerRun blocked-closeout card states that blocked/exhausted closeout is read-only evidence and does not authorize scheduler loop/full executor/whole-wave/slot allocation/worker start/worktree/run/child Change/source mutation/apply/close/merge/Harness evolution.
- AC-003: DOM regression tests render both terminal cards, assert the boundary text, and assert the cards do not expose local buttons or executable affordances.
- AC-004: The change does not modify scheduler runtime, Goal Loop policy/compiler, action registry, server/live action routing, schemas, bridge code, or canonical artifacts.

## Non-Goals

- No new runtime action, Workbench action, action payload field, schema field, or artifact writer.
- No scheduler loop, full parallel executor, whole-wave dispatch, slot allocator, worker auto-start, IntegrationCheck run, source apply/discard, close/archive, PR, landing, merge, or Harness evolution automation.
- No changes to Goal Loop prompt/context propagation or packet/controller/preflight behavior.

## Constraints

- AHO workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution records.
- Workpad cards are projections; they must not own scheduler policy or workflow authority.
- Main implementation logic must stay in the frontend Workpad typed workflow card owner. Broad server, bridge, registry, runtime, and Goal Loop facades must not receive this UI-only rule.
- Reference projects are evidence only. Loop Engineering and Codex goal continuation support the boundary but do not replace AHO gates.

## Risks

- Copy can become too long or internal. Mitigation: keep it concise and tied to terminal-card authority.
- Tests can overfit exact phrasing. Mitigation: assert key boundary phrases that future regressions should preserve.
- A UI-only fix could accidentally imply runtime change if placed in the wrong module. Mitigation: restrict implementation to Workpad card rendering and DOM tests.
