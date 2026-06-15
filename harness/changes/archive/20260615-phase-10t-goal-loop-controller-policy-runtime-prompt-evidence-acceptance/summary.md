# Phase 10T Goal Loop Controller Policy Runtime Prompt Evidence Acceptance

## Purpose

Phase 10T verifies the runtime prompt evidence boundary added by Phase 10S. The latest valid `GoalLoopControllerPolicy` may appear in main-Agent `chat.ask` / `orchestrator.plan` prompt context only as explanatory, non-executing evidence, and the run artifacts must record that relationship consistently.

This phase is acceptance hardening, not a new product capability. It does not add actions, routes, CLI commands, UI controls, worker prompts, scheduler execution, source mutation, child Changes, or workflow-truth authority.

## Scope

In scope:

- Fix post-10S handoff drift and record Phase 10T as active.
- Add focused acceptance coverage for actual `chat.ask` and `orchestrator.plan` run artifacts.
- Ensure `context.prepared` run events can record the `GoalLoopNextStepPacket` / `GoalLoopControllerPolicy` refs that were included in the main-Agent prompt context.
- Confirm stale or Workpad-mismatched controller policy is not recorded in prompt stack or context.

Out of scope:

- No new Workbench action, HTTP route, CLI command, UI/lazy projection, scheduler loop, worker start, validation/audit/IntegrationCheck execution, apply/close, child Change, source mutation, or worker prompt injection.
- No change to `GoalLoopControllerPolicy` generation semantics.
- No change to Run artifact JSON shape beyond existing event `data` refs.

## Current Status

Ready to close.

Before close, replace this with `Completed.` or `Ready to close.` and keep verification details current. The local close command rejects stale active/planning statuses.

## Verification

- `npm run test -- tests/unit/workbench.test.ts -t "records visible goal loop controller policy"`: passed.
- `npm run test -- tests/unit/goal-loop-decision.test.ts`: passed.
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`: passed.
- `npm run test -- tests/unit/workbench.test.ts -t "goal loop"`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed; no pending evolution before close.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

