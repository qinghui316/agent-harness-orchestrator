# Review: main-agent-taskrun-lifecycle-rework-ownership-v1

Status: approved.

## Findings

No blocking findings.

Notes:

- TaskRun bounded rework ownership moved into `src/main-agent-orchestration/taskrun-lifecycle.ts`.
- `runMainAgentTaskRunAttempt` remains a single-attempt entrypoint; lifecycle owns retry observation and one bounded `rework-coder` retry.
- TaskQueue still owns queue iteration and item completion; retry TaskRuns are rebound to the running queue item before rework coder execution.
- Stage resume no longer starts bounded rework directly; it returns a finished/blocked TaskRun result for the main-agent lifecycle to evaluate.
- No UI, confirmation queue, scheduler, apply/close, remote, PR, merge, or Harness evolution authority changed.

## Verification

- Selected verification scope: main-agent loop, orchestration engine, AgentTask domain, module boundaries, workflow actions, action revalidation, plus aggregate fast/build/Workbench gates.
- Full / aggregate suites run or skipped: `npm run test:fast`, `npm run build`, and `npm run test:workbench` were run and passed. Full slow/release suites were not run because this change does not alter scheduler parallel execution, source apply, remote, or release packaging paths.
- Rationale for selected scope: the change is an internal architecture migration across TaskRun/TaskQueue/main-agent orchestration boundaries; targeted suites cover the touched owners and aggregate fast/Workbench gates cover regression breadth.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

Commands run:

- `npx vitest run tests/unit/main-agent-step-loop.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: removed old direct bounded rework control from `task-run-sequence.ts` and `stage-resume-runner.ts`, and deleted the unused TaskRun auto-rework helpers from `bounded-rework.ts`.
- reuse: reused existing TaskRun start/retry/finish lifecycle, leaf stage execution, `decideNextMainAgentOrchestration`, and loop evidence.
- yagni: avoided new UI, new action type, new scheduler integration, free-form LLM decision, new workflow truth, and new persistence table.
- shrink: kept `task-run-sequence.ts` as a wrapper instead of adding a second runtime facade; kept TaskQueue and WorkflowRun ownership where it already existed.
- net: Main-agent orchestration owns bounded rework decisions; domain lifecycle owners remain intact.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested subagent review and explicit avoidance of new/old mixed control paths; subagent flagged TaskQueue retry binding and stage-resume compatibility as required constraints.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/tasks/review.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: not applicable.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `lint-ecl`, `harness-change status`, `harness-evolve check`.
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

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked runtime home / external managed-project isolation: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

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

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/main-agent-orchestration/`.
- If applicable, module owners checked: main-agent orchestration, TaskRun, TaskQueue, WorkflowRun, stage resume, workflow-runtime wrappers.
- If applicable, moved responsibilities: bounded TaskRun rework decision moved from workflow-runtime wrappers/stage resume into main-agent TaskRun lifecycle.
- If applicable, retained facade responsibilities: `task-run-sequence.ts` still starts/executes TaskRun wrapper paths; TaskQueue still owns queue iteration and item completion.
- If applicable, forbidden write-back locations: no scheduler runtime, Workbench UI/action handlers, apply/close, terminal, automation allowlist, or workflow-run owner imported by main-agent lifecycle.
- If applicable, compatibility surface: `runTaskRunMainAgentAttempt`, `executeStartedTaskRunWorkflow`, stage resume, and TaskQueue action paths remain available.
- If applicable, behavior path tested: single-attempt failure, lifecycle retry once, retry-budget exhaustion, TaskQueue retry binding boundary, stage-resume no direct rework.
- If applicable, follow-up split candidates: queue-level observe/decide migration and scheduler/parallel integration remain separate future changes.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: compatible; external behavior remains coder/validator/auditor with at most one bounded rework.
- If applicable, tested with: targeted Vitest suite plus `test:fast` and `test:workbench`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: reused main-agent step loop, loop evidence, TaskRun manager, TaskQueue item transitions, and existing leaf stages.
- If applicable, new cross-cutting mechanism and owner: `main-agent-orchestration/taskrun-lifecycle.ts` is a narrow lifecycle owner, not a new workflow engine.
- If applicable, why existing mechanisms were insufficient: old workflow-runtime/stage-resume paths directly owned retry decisions, keeping old pipeline control mixed with the new main-agent loop.
- If applicable, domain-specific logic location: TaskRun retry policy lives in `main-agent-orchestration/rework-policy.ts`.
- If applicable, shared cross-cutting logic location: TaskRun state transitions remain in `task-run`; queue item state remains in `task-queue`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new UI/read model/action registry/scheduler state machine.
- If applicable, public API / facade / Workbench compatibility result: compatible.
- If applicable, future-cost reduction result: next queue-level observe/decide migration can target main-agent orchestration without chasing legacy recursive rework paths.
- If applicable, tested with: targeted Vitest, typecheck, lint, fast, build, Workbench.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/tasks/review.
- If applicable, stale active-path / phase grep: `lint-ecl` and `harness-change status`.
- If applicable, latest archive / active path alignment: active path aligned before close; close will archive and require latest archive handoff update.
- If applicable, pending evolution state checked: `harness-evolve check`.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
