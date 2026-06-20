# Spec: Controlled Scheduler Stop Handoff

## Goal

After a user confirms `planning.scheduler.controlled-advance.run`, AHO should execute exactly one matched concrete scheduler transition and return a clear post-step handoff. The handoff tells the user-facing layer that the system stopped intentionally, whether the next current confirmation candidate has matching non-executing readiness evidence, and whether re-evaluation is needed.

## Users

- Developers using Workbench to continue a controlled Scheduler/Goal Loop driven task.
- Main Agent prompt/result surfaces that summarize what happened after a confirmed controlled advance.

## Acceptance Criteria

- AC-001: `planning.scheduler.controlled-advance.run` still executes exactly one concrete scheduler transition and then stops.
- AC-002: The action result includes a derived `postStepHandoff` for successful controlled advance attempts, built only from the controlled-step result and existing post-step Goal Loop evaluation/readiness outcomes.
- AC-003: When post-step readiness is prepared, the handoff identifies a next confirmation candidate/readiness evidence without implying authorization, auto-execution, or human approval.
- AC-004: When post-step readiness or evaluation fails, the successful scheduler transition is preserved and the handoff tells the user-facing layer that re-evaluation or evidence review is needed.
- AC-005: User-facing result summaries use plain language, avoid internal workflow-truth claims, and do not expose automatic loop, whole-wave, slot allocator, apply, close, merge, remote landing, or Harness evolution behavior.
- AC-006: Tests cover ready, warning, refresh-failed, and no-bypass behavior for the handoff and user summary.

## Non-Goals

- No automatic scheduler loop or hidden continuation.
- No new human gate, ToolPolicy path, or concrete scheduler action.
- No new persisted workflow-truth artifact or local scheduler state machine.
- No change to IntegrationCheck, apply/discard, close/archive, remote landing, PR, or Harness evolution authority.

## Constraints

- Workflow truth remains Change/ECL, accepted artifacts, Run, Validation, Audit, IntegrationCheck, Apply/Close human gates, and Harness evolution.
- Goal Loop/controller/readiness evidence remains non-executing.
- `postStepHandoff` is a derived result DTO only; it must not be persisted or consumed as scheduler truth.
- Readiness language must mean "matching next confirmation candidate/readiness evidence exists", not "the next action is authorized".
- Every controlled advance must still re-read and revalidate current evidence before executing the one concrete transition.
- If rendered Workbench/browser behavior changes, close-ready review requires real UI validation rather than fake acceptance.

## Risks

- The handoff could accidentally become a local state machine if it invents scheduler states instead of deriving from existing evidence.
- User copy could overstate readiness as authorization.
- A broad UI rewrite or test refactor could delay product functionality; keep this scoped to stop/next-step handoff.
