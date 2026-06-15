# Plan: Phase 10T Goal Loop Controller Policy Runtime Prompt Evidence Acceptance

## Approach

Keep the phase as acceptance hardening. Update handoff docs, add run-event evidence refs for the already selected Goal Loop prompt context, and add focused tests over actual `runCodexChat()` / `runOrchestratorPlan()` artifacts using the existing fake Codex path.

## Steps

1. Fill ECL artifacts and update handoff docs for Phase 10T.
2. Add `goalLoopNextStepPacketId` / `goalLoopControllerPolicyId` to `context.prepared` event `data` for main-Agent chat/orchestrator runs when present.
3. Add tests that exercise actual chat/orchestrator run artifacts for valid policy and stale/mismatched policy suppression.
4. Run focused tests, full product verification, and Harness verification.
5. Close the change and commit, excluding unrelated `README.md`.

## Decisions

- Treat `promptStack` and `context.prepared` refs as evidence labels only, not execution authorization.
- Do not add a new action, projection, route, UI, worker prompt, scheduler runtime behavior, or Goal Loop controller behavior.
- Avoid moving freshness logic into `bridge.ts`; it remains in `src/goal-loop` and `goal-loop-context.ts`.

## Module Boundary Plan

- Owner module: `src/workbench/codex-chat/bridge.ts` for run artifact/event emission; `src/goal-loop/` and `src/workbench/codex-chat/goal-loop-context.ts` retain policy freshness and Workpad parity ownership.
- New / moved responsibilities: no moved responsibilities; event evidence refs are added to the existing context-prepared emission.
- Facade touch points: none.
- Forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/manager.ts`, `src/goal-loop/manager.ts`, server routes, web UI shell, action handlers, scheduler runtime, code/validation/audit worker prompt modules.
- Compatibility surface: existing `run.json`, `context.md`, `prompt.md`, and `events.jsonl` artifacts remain compatible; event data gains optional refs.
- Boundary tests: actual chat/orchestrator run artifact tests for valid and stale/mismatched controller policy.
- Follow-up split candidates: none.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

None yet.

