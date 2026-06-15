# Plan: Phase 10S Goal Loop Controller Policy Main Agent Context Boundary

## Approach

Keep the change narrow: consume existing `GoalLoopControllerPolicy` evidence in the existing main-Agent context builder. The owner module is `src/goal-loop`; Workbench codex-chat remains a thin visibility boundary that checks selected Workpad projection parity before exposing the context.

## Steps

1. Update ECL and handoff docs for Phase 10S.
2. Extend `GoalLoopMainAgentContextSection` to carry optional controller policy metadata.
3. Read latest controller policy in `buildGoalLoopMainAgentContextSection()` and append a policy subsection only when lineage, Change scope, packet id, and non-execution checks match.
4. Extend `buildVisibleGoalLoopMainAgentContextSection()` so a policy subsection is retained only when Workpad projection exposes the same controller policy.
5. Add focused tests for valid injection, stale-policy omission, and visible-context parity.
6. Run focused and full verification, then close and commit.

## Decisions

- Missing or invalid controller policy should not hide a valid next-step packet; it only omits the controller subsection.
- Stale packet behavior remains strict: stale packet suppresses the whole Goal Loop main-Agent context.
- No new user-facing confirmation item is added. The controller policy explains posture; the concrete current gate remains separate.

## Module Boundary Plan

- Owner module: `src/goal-loop`.
- New / moved responsibilities: controller policy prompt-context validation and rendering.
- Facade touch points: `src/goal-loop/manager.ts` remains a compatibility export barrel only.
- Forbidden write-back locations: `src/workbench/chat.ts`, Workbench action handlers, server routes, web UI shells, CLI modules, scheduler-runtime modules, and worker prompt builders.
- Compatibility surface: existing `buildGoalLoopMainAgentContextSection()` call sites continue to work; returned object gains optional policy metadata.
- Boundary tests: focused Goal Loop tests cover context injection and suppression; Workbench tests cover visible context parity.
- Follow-up split candidates: none.

## Planning-Discovered Gaps

- Subagent review found no blocking architecture issue, but recommended keeping the policy out of worker prompts and suppressing it if Workpad projection does not expose the same policy.
