# Plan: workbench-action-active-target-revalidation-reuse

## Approach

Add a small Workbench action-owned target helper and apply it mechanically to repeated active Change target lookups in `assertCurrentHighImpactWorkflowTarget`.

The helper will not own action-specific rules. It will only perform explicit `changeId` active target lookup and stale/missing active Change error construction. Each action branch keeps its existing payload requirements, artifact reads, status checks, latest checks, lineage checks, ToolPolicyGate flow, and human-gate boundary.

## Steps

1. Add `src/workbench/actions/active-target.ts` with a typed helper for active Change target resolution.
2. Refactor `src/workbench/actions/boundary.ts` to use the helper in repeated active-target lookup sites.
3. Preserve existing error messages where practical by passing action-specific labels.
4. Run targeted TypeScript/tests and Harness checks.
5. Complete independent close-ready review and close the change only if handoff and active-change state are aligned.

## Decisions

- The owner module is `src/workbench/actions/`, because the repeated concern is Workbench high-impact action target revalidation.
- The helper receives an action label rather than action type logic so it stays generic to active Change lookup and does not become a second action registry.
- Existing scheduler/Goal Loop/planning artifact validation remains in `boundary.ts` branches for this slice to avoid mixing domain rules into the shared lookup helper.

## Module Boundary Plan

- Owner module: `src/workbench/actions/`.
- New / moved responsibilities: active Change target lookup for Workbench action stale revalidation.
- Facade touch points: none expected; `boundary.ts` continues to expose the same audit/high-impact action functions.
- Forbidden write-back locations: no new main logic in Workbench server routes, frontend, bridge, `src/workbench/chat.ts`, manager facades, or scheduler/Goal Loop managers.
- Compatibility surface: action ids, request payloads, route/API shapes, ToolPolicyGate audit, SSE/live events, and public Workbench behavior remain unchanged.
- Boundary tests: TypeScript compilation plus existing Workbench/goal-loop/scheduler action stale-target unit coverage.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench high-impact action target revalidation, explicit `changeId` scoping, stale-target fail-closed behavior, and ToolPolicyGate audit flow.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no new authority mechanism is proposed; the change extracts a repeated lookup into an owned helper.
- Domain-specific logic location: existing action branches in `src/workbench/actions/boundary.ts`.
- Shared cross-cutting logic location: `src/workbench/actions/active-target.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids each action branch inventing its own active Change lookup and stale/missing active Change error pattern.
- Future-cost reduction for similar features: new Workbench high-impact actions can reuse the same active-target lookup before adding only their domain-specific stale-target rules.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None blocking. Subagent plan self-evaluation passed before ECL creation and found no pending evolution or reference-source requirement for this narrow source convergence slice.
