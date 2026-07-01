# Review: main-agent-workflowgraph-policy-v2-replay-failure-boundary

Status: approved.

## Findings

None.

## Verification

- Selected verification scope: main-agent WorkflowGraph replay/policy, observation evidence, TaskQueue runtime, module boundaries, workflow action/revalidation boundaries, package type/lint/build gates, and Harness checks.
- Passed:
  - `npx vitest run tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts`
  - `npx vitest run tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-task-runtime.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Pending before close: none.
- Full / aggregate suites skipped: full `npm run test` and release/slow Workbench suites were not run because this change does not alter UI, scheduler execution, apply/close, remote, or release packaging behavior. `test:fast` plus targeted TaskQueue/workflow boundary suites cover the touched runtime boundary.

## Complexity Deletion Review

- delete: removed the execution-like `continue-queue-step-loop` policy kind from production code.
- reuse: reused existing `decision-policy.ts`, `workflowgraph-replay.ts`, and `recordMainAgentWorkflowGraphObservationAndReplay(...)`.
- yagni: avoided UI exposure, action bridge expansion, scheduler policy, SQLite persistence, a new classifier framework, and a second replay consumer.
- shrink: hardened the shared helper instead of adding caller-local try/catch in planning handlers.
- net: Lean; this tightens existing owners rather than adding a parallel architecture path.

## Documentation Entropy Coverage

- Applicable: yes. This change updates `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Current line counts after update: `AGENTS.md` 428, `docs/STATUS.md` 565, `docs/CURRENT-DEVELOPMENT-PLAN.md` 412.
- Duplicate current-state fields checked: active change pointer, latest archive pointer, replay consumption completed state, and Policy V2 next slice.
- Roadmap/current-direction stale language checked: removed replay consumption from remaining work and replaced the old latest implementation slice pointer.
- Historical detail: archive summaries were left unchanged; current docs only received active handoff and next-route corrections.

## Proposal / Runtime Boundary Coverage

- Applicable: yes. Replay summary and policy recommendations can be confused with execution guidance.
- Artifact classification: replay summary and policy output remain read-only, in-memory, non-executing projection/evidence.
- Boundary matrix: canonical managers remain current-state truth; historical JSONL is explanatory; `nextObservation` carries reason/targets only; action bridge, scheduler, apply/close, and confirmation queue are out of scope.
- Stale/forged target behavior: malformed, old-schema, stale, and scope-mismatched evidence becomes gaps and drives inspect/wait behavior.
- Tested with: targeted policy/replay/observation tests and module-boundary tests.

## Module Boundary Coverage

- Applicable: yes. This changes cross-module workflow read-model state.
- Owner modules checked: `src/main-agent-orchestration/decision-policy.ts`, `workflowgraph-replay.ts`, and `workflowgraph-replay-consumption.ts`.
- Forbidden imports checked by tests: Workbench UI, confirmation queue, workflow action handlers, scheduler runtime, terminal, apply/close, and automation allowlist.
- Compatibility result: no Workbench UI or workflow action behavior changes; old production sequence wrappers remain absent.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms strengthened: WorkflowGraph observation evidence, replay health/gaps, decision policy, module-boundary tests, and current handoff docs.
- New cross-cutting mechanism: none.
- Domain-specific logic location: WorkflowGraph replay/policy remains under `main-agent-orchestration`.
- Local framework avoided: no new runner, state machine, persistence layer, UI projection, or scheduler bridge.
- Future-cost reduction: future bridge/recovery/scheduler work can read one observation-only policy output and trust replay failures are bounded as health gaps.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: checked for replay consumption remaining wording and old active path language with `rg`.
- Latest archive / active path alignment: active docs now point to this active change until close.
- Pending evolution state checked: none before implementation.
- Latest Harness check result: no pending evolution; 3 archived changes since the last completion, below threshold 5.

## Other Coverage

- Worktree Diff Artifact Coverage: not applicable; no worktree diff behavior changed.
- Workbench User-Surface Honesty Coverage: not applicable; no product-visible UI changed.
- Scoped Workbench Action Payload Coverage: not applicable; no live/server UI action payload changed.
- Source Apply Safety Coverage: not applicable; no apply/discard or source-root handoff changed.
- Runtime Bridge Boundary Coverage: not applicable; no Codex bridge, SQLite, Topic session, prompt stack, or external executor behavior changed.
- Goal Loop Boundary Coverage: not applicable; this change does not alter GoalLoopDecision or autonomous continuation behavior.
- Remote Handoff Acceptance Coverage: not applicable; no PR/remote behavior changed.
