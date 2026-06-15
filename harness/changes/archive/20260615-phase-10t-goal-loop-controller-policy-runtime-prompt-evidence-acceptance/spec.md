# Spec: Phase 10T Goal Loop Controller Policy Runtime Prompt Evidence Acceptance

## Goal

Prove that `GoalLoopControllerPolicy` evidence reaches actual main-Agent runtime prompt artifacts only when it is current, visible, and scoped to the selected Change.

## Users

Developers using AHO Workbench main-Agent chat / orchestration loops for long-running Goal-driven work.

## Acceptance Criteria

- AC-001: Docs record Phase 10S closed and Phase 10T active with no stale "active none" handoff claim.
- AC-002: `chat.ask` run artifacts include `goal-loop-controller-policy` in `run.json.promptStack`, a Controller Policy section in `context.md` / `prompt.md`, and matching packet/policy refs in `context.prepared` only when Workpad-visible Goal Loop evidence exposes the same packet and policy.
- AC-003: `orchestrator.plan` run artifacts have the same prompt stack, context, prompt, and `context.prepared` evidence behavior.
- AC-004: Stale or Workpad-mismatched controller policy is stripped from main-Agent prompt context and prompt stack.
- AC-005: Controller policy evidence remains explanatory only; no Workbench action, route, CLI command, UI control, worker prompt, scheduler/runtime execution, source mutation, child Change, or workflow-truth authority is added.
- AC-006: Focused and full verification pass, or any pre-existing failure is explicitly recorded.

## Non-Goals

- Do not add a Goal Loop controller runtime or automatic continuation loop.
- Do not inject controller policy into coder, validator, auditor, scheduler worker, or other leaf worker prompts.
- Do not change `GoalLoopControllerPolicy` compiler/freshness semantics unless tests expose a real bug.
- Do not change public Run artifact shape, Workbench projection JSON, SSE, thread storage, action payloads, or decision/audit scope.

## Constraints

- `src/goal-loop/` remains owner of policy lineage/freshness and context rendering.
- `src/workbench/codex-chat/goal-loop-context.ts` remains owner of Workpad projection parity filtering.
- `src/workbench/codex-chat/bridge.ts` may only write run artifacts and run events for the context it already received.
- Broad facades, server routes, frontend shell, action handlers, scheduler runtime, and worker prompt modules are forbidden write-back locations.

## Risks

- `promptStack` could claim policy context even after Workpad parity strips it.
- A run event ref could be mistaken for execution authorization rather than evidence.
- Over-testing with fake Codex could accidentally depend on unrelated source mutation side effects.

