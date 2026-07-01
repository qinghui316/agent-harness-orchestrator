# Review: main-agent-loop-projection-retirement-v6

Status: pass.

## Findings

None blocking.

## Verification

- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-goal-loop-surface.test.ts tests/unit/action-revalidation.test.ts tests/unit/controlled-scheduler-post-step-projection.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after active handoff docs were corrected to point to this active change.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.
- `rg -n "mainAgentLoopProjection|MainAgentLoopProjection|main-agent-loop-projection|buildMainAgentLoopProjection" src tests` has no production `src/` hits; only negative test assertions remain.

## Scope Review

- Deleted `src/goal-loop/main-agent-loop-projection.ts` and the Goal Loop manager re-export.
- Removed Workpad read-model construction/return fields and backend/frontend DTO declarations for `mainAgentLoopProjection`.
- Deleted the old projection unit suite and converted boundary/read-model/UI tests to retirement protection.
- Kept Goal Loop summaries, controller policy, preflight/feedback/close handoff, `mainAgentLoopRunId` / `mainAgentNextStepEvidenceId`, action bridge revalidation, main-agent loop evidence, WorkflowGraph replay/policy/backflow, Scheduler, IntegrationCheck, confirmationQueue, action registry, automation allowlist, ToolPolicyGate, apply/close, remote, PR, merge, and Harness evolution boundaries.

## Complexity Deletion Review

- delete: removed one obsolete projection owner, DTO field, and unit suite.
- reuse: retained existing Goal Loop summary and main-agent orchestration evidence owners.
- yagni: did not add replacement projection, UI, action, gate, scheduler bridge, or permission path.
- shrink: Workpad/Web DTOs now have one fewer duplicate main-agent judgment path.
- net: leaner.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Roadmap/current-direction stale language checked: yes; current docs no longer recommend projection retirement as the next step.
- Archive-ledger content promoted / retained / retired / archive-only: historical archives retained unchanged.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: Workpad read-model, backend DTO, Web DTO, confirmation queue, DecisionInspectorPane, Goal Loop surface.
- Tested with: targeted Workbench/read-model/web-app suites and `npm run test:workbench`.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: Goal Loop summary/current-gate tests still pass.
- Recommendation authority checked: deletion removes only duplicate Workpad DTO projection; Goal Loop evidence remains non-executing and current gates remain separate.
- Hidden execution / source mutation check: no action handler, scheduler executor, source mutation, apply/close, or automation allowlist changed.
- Tested with: `tests/unit/workbench-goal-loop-surface.test.ts`, `tests/unit/action-revalidation.test.ts`, `tests/unit/controlled-scheduler-post-step-projection.test.ts`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Module owners checked: Goal Loop manager, Workpad read-model, backend/frontend DTOs, module-boundary greps.
- Moved responsibilities: none.
- Retained responsibilities: Goal Loop summaries and main-agent orchestration evidence/replay/policy/backflow remain with their owners.
- Forbidden write-back locations: Scheduler, IntegrationCheck, confirmationQueue, action registry, automation allowlist, source roots, SQLite, apply/close, Harness evolution.
- Compatibility result: Workbench server and Web client are versioned together; no persisted migration needed.
- Tested with: `tests/unit/workbench-module-boundaries.test.ts`.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Latest archive / active path alignment: active docs point to this active change before close; close will archive it and reindex.
- Pending evolution state checked: `harness-evolve check` reports no pending evolution.
