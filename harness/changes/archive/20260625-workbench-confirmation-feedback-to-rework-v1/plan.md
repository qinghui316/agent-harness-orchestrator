# Plan: workbench-confirmation-feedback-to-rework-v1

## Approach

Add a thin feedback routing layer behind the existing Workbench action endpoint. The router revalidates the submitted feedback against the current `confirmationQueue.primary`, records the existing requested-changes decision, then delegates only supported contexts to existing handlers: `planning.revise` for plan confirmation feedback and `result.refresh-rework` for result/apply feedback. Unsupported gates remain record-only.

## Steps

1. Inspect current feedback submission shape, confirmation queue payloads, planning revision, and result rework handlers.
2. Add feedback current-gate revalidation and routing for planning and result/apply contexts.
3. Ensure UI feedback submissions carry enough context to distinguish planning bundle and worktree/result targets.
4. Add targeted tests for planning revise, result rework, stale/cross-change fail-closed, unsupported gate record-only, and DOM user-surface behavior.
5. Run targeted verification, product checks, and Harness checks; record review evidence.
6. If feasible within the turn, perform E-drive real UI acceptance for plan feedback and result feedback; otherwise record why mechanical coverage is sufficient and leave real UI as follow-up evidence.

## Decisions

- V1 routes only two supported feedback contexts: planning confirmation and result/apply.
- Unsupported gates are record-only because there is no safe universal rework target.
- Feedback routing lives in the existing Workbench server/action-handler path, not a new runtime.
- Feedback does not reuse `完全访问权限` as authorization and does not start apply/close.

## Minimality Gate Plan

- Can this be a no-op: no; current server feedback path records `requested-changes` but does not drive revise/rework.
- Reuse: existing inline feedback UI, `executeApprovalOrFeedbackAction`, `planning.revise`, `result.refresh-rework`, `getWorkbenchSnapshot`, confirmation queue projection, and current action target ids.
- Shared root fix: fix the common server feedback branch instead of adding UI-only guards or separate plan/result-only endpoints.
- Avoided: new feedback runtime, new permission system, new evidence family, new Workbench projection framework, and broad workflow state machine.
- Smallest coherent change: add one reusable feedback router/revalidator and bounded handler delegation.

## Module Boundary Plan

- Owner module: Workbench action execution/server feedback branch; planning logic remains in `src/workbench/actions/handlers/planning.ts`; rework remains in existing workflow action handler map.
- New / moved responsibilities: classify current confirmation feedback and delegate to existing owners.
- Facade touch points: `src/server/workbench/actions.ts` may stay as the HTTP action facade but should delegate routing to a focused helper if the logic grows.
- Forbidden write-back locations: do not add main logic to frontend-only components, Workbench read-model builders, Goal Loop handlers, or automation runtime.
- Compatibility surface: existing Workbench action POST shape remains compatible; `feedbackContext` may gain optional target fields.
- Boundary tests: action/server tests plus DOM tests for submitted payloads and visible behavior.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: confirmation queue, action target ids, Workbench decisions, planning revision, bounded rework, source safety via existing apply separation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new cross-cutting mechanism is proposed.
- Domain-specific logic location: feedback route classification in Workbench action server/handler boundary.
- Shared cross-cutting logic location: current-gate matching and target-id fail-closed checks.
- Local framework / state machine / projection / validation / gate avoided: no feedback-specific runtime loop or permission layer.
- Future-cost reduction for similar features: later feedback contexts can extend one router with explicit target checks instead of each surface inventing local behavior.

## Planning-Discovered Gaps

None yet.
