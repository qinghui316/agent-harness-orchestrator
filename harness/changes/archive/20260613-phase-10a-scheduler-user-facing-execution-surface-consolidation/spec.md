# Spec: Phase 10A Scheduler User Facing Execution Surface Consolidation

## Goal

Make the scheduler execution path understandable to ordinary users after the parallel plan is prepared and launch intent is confirmed. The right confirmation queue should describe the next user decision as a small set of main-agent stage actions, while the underlying action remains a single existing scoped scheduler transition.

## Users

- Product user reviewing and approving a scheduler-backed AHO demand through the Workbench.
- Main Agent that explains the current scheduler state in the conversation.
- Future maintainers adding scheduler features who need clear owner-module boundaries.

## Acceptance Criteria

- AC-001: Docs record Phase 9Z and the latest Harness evolution as archived, Phase 10A active, and no stale Phase 9Z active claim.
- AC-002: Scheduler execution confirmations use user-facing labels such as continuing the next task, checking current results, handling current blockage, checking combined results, and ending the run, instead of exposing every internal scheduler checkpoint as primary user language.
- AC-003: Each consolidated user-facing confirmation still executes exactly one existing scoped scheduler action; it does not run a loop or batch high-impact runtime transitions.
- AC-004: Existing scheduler action ids, payload ids, decision/audit scope, stale-target revalidation, ToolPolicyGate behavior, thread entries, and SSE/live event behavior remain compatible.
- AC-005: Scheduler action handler glue is moved out of broad planning handler ownership into a scheduler Workbench handler module; `planning.ts` no longer carries the main scheduler execution handler implementations.
- AC-006: New scheduler user-surface / handler modules do not depend on `chat.ts`, server routes, web UI shell files, CLI command modules, or broad facade implementation files.
- AC-007: Source apply remains outside scheduler runtime: existing IntegrationCheck apply/discard remains the only source-root mutation gate.
- AC-008: No scheduler loop, slot allocator, whole-wave dispatch, full parallel executor, child Change, new CLI/API/route, or new source mutation capability is introduced.
- AC-009: Product and Harness verification pass, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not remove internal scheduler evidence artifacts or lazy projections.
- Do not rename existing internal action types.
- Do not auto-run validation, audit, rework, next-worker start, IntegrationCheck, apply, or closeout.
- Do not copy Symphony, AgentScope, or Open Dynamic Workflows runtime behavior.

## Constraints

- AHO remains Change/ECL + accepted artifacts + Run/Validation/Audit + IntegrationCheck/apply/close human gates as workflow truth.
- The right confirmation queue is a Harness stage gate, not a generic tool-permission popup.
- ToolPolicyGate and server stale-target revalidation must still see complete scoped target ids.
- UI/projection code may map labels and summaries, but scheduler legality decisions must stay in scheduler-runtime or owned Workbench scheduler helper modules.
- `README.md` remains unrelated and untracked.

## Risks

- Over-consolidating could accidentally hide high-impact behavior; mitigate by keeping one user confirmation to one existing action and preserving action ids in detail/audit scope.
- Moving handlers could break imports; mitigate with focused workflow-action and Workbench tests.
- User-facing labels could imply full automation; mitigate with explicit summaries that no loop, start-all, apply, or merge occurs.
