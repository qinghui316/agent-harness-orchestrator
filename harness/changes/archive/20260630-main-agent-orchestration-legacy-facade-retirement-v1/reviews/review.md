# Review: main-agent-orchestration-legacy-facade-retirement-v1

Status: completed.

## Findings

None.

## Verification

- Selected verification scope: targeted orchestration, AgentTask, module-boundary,
  workflow action, action revalidation, aggregate fast/unit Workbench, type,
  lint, build, and Harness checks.
- Full / aggregate suites run or skipped: `test:fast`, `build`, and
  `test:workbench` ran and passed. Full `npm run test` was skipped because the
  touched boundary is covered by targeted orchestration/runtime suites plus the
  fast and Workbench aggregates.
- Rationale for selected scope: the change removes a facade and updates runtime
  call routing without UI or provider changes; targeted tests cover the exact
  TaskRun/rework/action boundaries and aggregate suites cover regressions.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

Commands passed:

- `npx vitest run tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed `src/workflow-runtime/kernel/role-stage-runner.ts` and the old production export/call surface for `runCodeValidateAuditSequence`.
- reuse: existing leaf stages, main-agent orchestration state/decision engine, TaskRun lifecycle, source-refresh prompt builder, and remote feedback lifecycle owners.
- yagni: avoided new UI, new action types, new scheduler/automation paths, new provider/runtime abstraction, or free-form loop.
- shrink: checked direct replacement with `runMainAgentOrchestration`; rejected because TaskRun requires the top-level attempt result shape.
- net: Smaller owner surface and lower future migration cost.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/spec/plan/tasks/review.
- If applicable, before/after line counts: not measured; handoff edits are narrow current-active pointers.
- If applicable, duplicate current-state fields checked: active change pointer aligned across `AGENTS.md` and `docs/STATUS.md` during implementation.
- If applicable, roadmap/current-direction stale language checked: no roadmap expansion in this change.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: old facade retirement recorded only in active change.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `lint-ecl`, `harness-change status`.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs, or handoff change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: no.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: not applicable.
- If applicable, visible primary UI backed by implemented workflow paths: not applicable.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: not applicable.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: not applicable.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Workbench user-facing decision surfaces, Workpad projections, composer actions, task/queue/audit controls, or post-run result actions.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: no.
- If applicable, reference map section inspected: not applicable.
- If applicable, reference source files or inspected commit used: not applicable.
- If applicable, controls copied / adapted / intentionally omitted: not applicable.
- If applicable, fake-control check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not claim alignment with a reference project for product or UI behavior.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If applicable, canonical transcript projection checked: not applicable.
- If applicable, assistant markdown source checked: not applicable.
- If applicable, process/tool row compactness checked: not applicable.
- If applicable, derived workflow summary exclusion checked: not applicable.
- If applicable, worker/role transcript scoping checked: not applicable.
- If applicable, private chain-of-thought exclusion checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect the default Workbench main conversation transcript or parent-agent transcript projection.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes, because source-refresh rework routing changed.
- If applicable, checked source project / fixture: unit fixtures only.
- If applicable, checked runtime home / external managed-project isolation: unchanged.
- If applicable, checked worktree ids / result ids / integration check ids: source-refresh still requires explicit `worktreeId` and uses the existing prompt builder.
- If applicable, source-root mutation gate checked: no apply/discard path changed; result refresh still routes through bounded role orchestration evidence.
- If applicable, out-of-scope source mutation check: no apply/close/remote/merge/PR/Harness evolution action types changed.
- If applicable, tested with: targeted workflow/action tests, `test:fast`, `test:workbench`.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- If applicable, persistent Goal/Change scope checked: no GoalLoopDecision policy or packet shape changed.
- If applicable, recommendation authority checked: main-agent orchestration remains bounded role execution only, not workflow truth.
- If applicable, fallback priority checked: unchanged.
- If applicable, packet / main-Agent context freshness checked: unchanged.
- If applicable, stale or superseded packet suppression checked: unchanged.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: PR feedback lifecycle remains in remote-handoff owner.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: unchanged.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: no confirmation queue or action registry changes.
- If applicable, hidden execution / source mutation check: no new action path or automation allowlist change.
- If applicable, ToolPolicyGate / human gate preservation checked: leaf stages still reuse RoleDispatcher/ToolPolicyGate.
- If applicable, tested with: goal-loop/action/workbench aggregate tests listed above.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/main-agent-orchestration/`.
- If applicable, module owners checked: TaskRun lifecycle stays in task-run/workflow-runtime; source-refresh action handler owns action payload; remote feedback stays in remote-handoff.
- If applicable, moved responsibilities: bounded role attempt entrypoints moved out of legacy workflow-runtime facade surface.
- If applicable, retained facade responsibilities: `workflow-runtime/code-workflow.ts` still exports TaskRun/TaskQueue wrappers and runtime guard helpers only.
- If applicable, forbidden write-back locations: confirmation queue, action registry, scheduler runtime, terminal, apply/close, PR/remote landing authority.
- If applicable, compatibility surface: TaskRun finish keeps receiving top-level attempt result shape.
- If applicable, behavior path tested: TaskRun setup failure, workflow actions, action revalidation, Workbench task runtime and demand worker suites.
- If applicable, follow-up split candidates: future continuous-loop decision/journal work remains separate.
- If applicable, boundary tests or lint checks: `workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: old production facade removed; new semantic entrypoints exported.
- If applicable, tested with: verification commands listed above.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: main-agent orchestration owner, leaf stages, RoleDispatcher, ToolPolicyGate, TaskRun/remote lifecycle owners.
- If applicable, new cross-cutting mechanism and owner: no new mechanism; semantic entrypoints added to existing owner.
- If applicable, why existing mechanisms were insufficient: old facade name kept attracting production callers.
- If applicable, domain-specific logic location: unchanged in task-run/workflow-runtime and remote-handoff.
- If applicable, shared cross-cutting logic location: `src/main-agent-orchestration/`.
- If applicable, local framework / state machine / projection / validation / gate avoided: yes.
- If applicable, public API / facade / Workbench compatibility result: old sequence export removed, TaskRun/TaskQueue wrapper exports retained.
- If applicable, future-cost reduction result: future continuous loop phases have one orchestration owner to extend.
- If applicable, tested with: targeted and aggregate verification listed above.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- If applicable, stale active-path / phase grep: active path currently aligned; close pass must update to archive path.
- If applicable, latest archive / active path alignment: pending final close.
- If applicable, pending evolution state checked: `harness-evolve check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: yes.
- If applicable, checked provider/repository/action boundary: PR feedback rework now calls `runMainAgentFeedbackRework`; feedback snapshot/attempt/task completion and Draft PR update gate remain in remote-handoff owner.
- If applicable, tested with: targeted workflow/action tests and Workbench aggregate suites.
- If not applicable, reason: not applicable.

