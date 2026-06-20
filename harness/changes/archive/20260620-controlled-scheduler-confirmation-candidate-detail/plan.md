# Plan: controlled-scheduler-confirmation-candidate-detail

## Approach

Add an optional candidate-detail field to confirmation queue items and decision contexts, then render it in the existing right confirmation card.

## Owner Modules

- Read-model confirmation owner: `src/workbench/projections/read-model/confirmation/goal-loop.ts`
  - Reuse the same matching/freshness predicate that already merges ready candidate evidence refs.
  - Attach the existing Workpad candidate only for `ready-for-confirmation`.
- Workbench read-model types: `src/workbench/read-model-types.ts`
  - Add an optional field typed from `WorkbenchControlledSchedulerNextCandidate`.
- Web DTO/types and rendering: `src/web/src/types.ts`, `src/web/src/panels/workbench/DecisionPanels.tsx`
  - Pass the optional field through `confirmationItemToDecisionContext`.
  - Render the detail as passive explanation only.
- Tests:
  - `tests/unit/workbench-goal-loop-surface.test.ts` for read-model attachment/absence and action count.
  - `tests/unit/web-app.test.tsx` for real React App DOM rendering of the right confirmation card.

## Core Mechanism Reuse / Architecture Growth Control

- Existing mechanisms reused:
  - `WorkbenchControlledSchedulerNextCandidate` as the single candidate DTO.
  - `attachControlledSchedulerAdvanceActions` as the controlled scheduler confirmation transformation point.
  - Existing confirmation queue and `DecisionPanels` rendering path.
  - Existing action target matching and evidence-ref merge predicate.
- No new local framework/state machine/projection/gate is introduced.
- Domain-specific logic stays in the read-model confirmation owner; frontend rendering remains generic/passive.
- The change lowers future UI cost by making confirmation queue items capable of carrying already-derived detail without inventing feature-specific card logic outside the owner.

## Boundary Checks

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- The existing concrete controlled Scheduler advance remains the only executable action on the card.
- Goal Loop candidate detail does not execute, authorize ToolPolicyGate, mutate source, start workers, dispatch waves, allocate slots, apply, close, merge, or evolve Harness rules.
- `needs-review` stays explanatory in Workpad detail, not on the executable confirmation card.

## Reference Evidence

- Open Design supports readable tool/detail cards in a local Workbench while raw mechanics stay behind evidence surfaces.
- Loop Engineering supports objective-driven continuation only when bounded by evidence and gates.
- Open Dynamic Workflows and Symphony support bounded leaf work and reconcile dashboards, but AHO must not copy runtime authority or unattended dispatch.

## Verification Plan

- `npx vitest run tests/unit/workbench-goal-loop-surface.test.ts tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Harness checks:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Plan Review

Plan self-review subagent `019ee4f8-d4e1-73b0-ab25-67d8a05238b4` returned PASS. Required refinements adopted:

- Attach candidate detail only under the existing refreshed/matching predicate and only for `ready-for-confirmation`.
- Keep readiness decisions in read-model confirmation owner.
- Let `DecisionPanels` render only optional DTO detail.
- Tests must prove one controlled advance button remains, no extra action appears, DOM detail is visible, stale/needs-review candidates are absent, and human confirmation copy remains visible.
