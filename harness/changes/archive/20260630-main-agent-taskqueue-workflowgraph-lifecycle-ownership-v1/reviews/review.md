# Review: main-agent-taskqueue-workflowgraph-lifecycle-ownership-v1

Status: approved for close.

## Findings

Subagent architecture review completed before implementation. No blocking
finding against the direction. Required constraints:

- Preserve stage-resume semantics and never rerun coder for resume-only paths.
- Make TaskQueue execution gate scope fail closed instead of optional fallback.
- Bind resume candidates to current queue/workflow scope.
- Remove old TaskQueue runner control ownership and production rework helper use.

## Verification

Passed.

- Selected verification scope: main-agent orchestration, TaskQueue runtime,
  Workbench workflow action boundary, and module-boundary suites.
- Targeted suites:
  - `npx vitest run tests/unit/workbench-task-runtime.test.ts tests/unit/main-agent-step-loop.test.ts tests/unit/workbench-module-boundaries.test.ts`
  - `npx vitest run tests/unit/main-agent-step-loop.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-task-runtime.test.ts`
- Aggregate suites:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
  - `npm run test:workbench`
- Harness checks:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 reindex`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-change.ps1 status`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`
- Rationale for selected scope: this change moves TaskQueue / WorkflowGraph
  lifecycle ownership into main-agent orchestration without changing UI or
  high-impact gates. The selected suites cover the new owner, TaskRun and
  TaskQueue behavior, module boundaries, workflow actions, and revalidation.
- No aggregate Workbench / slow suite timeout occurred.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: old queue-control ownership from `workflow-runtime/kernel/task-queue-runner.ts`
  and direct bounded-rework production calls from the old workflow-runtime
  sequence path.
- reuse: existing TaskQueue, TaskRun, WorkflowRun, validation, audit, and
  taskqueue reconcile/sync owners must remain the persistence/evidence owners.
- yagni: avoided: no UI, no scheduler fan-out, no free-form LLM decision, no new
  workflow truth.
- shrink: simpler alternative checked: keeping a wrapper-only TaskQueue runner
  while moving lifecycle ownership under main-agent orchestration avoids a
  broad rewrite and avoids creating a second TaskQueue persistence owner.
- net: Lean: one new lifecycle owner, one stage-resume helper, and one wrapper
  replace the old runner loop/rework ownership without adding UI or authority.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: subagent Dewey reviewed the plan and
  required stage-resume, gate-scope, resume-scope, and old-runner deletion
  constraints.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active
  change summary/review/tasks.
- If applicable, before/after line counts: not required; changes are handoff
  pointers and active-change evidence only.
- If applicable, duplicate current-state fields checked: active pointers are
  limited to current handoff fields.
- If applicable, roadmap/current-direction stale language checked: no stale
  previous active path remains in active change files.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only:
  implementation details remain in the archive summary/review.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: Harness reindex/status/evolve checks.
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
- If applicable, module owners checked: TaskQueue persistence remains under
  `src/task-queue/`; TaskRun lifecycle remains under task-run runtime/domain
  owners; WorkflowRun sync remains under workflow-run manager; main-agent
  orchestration owns sequential queue lifecycle control and stage-resume
  orchestration.
- If applicable, moved responsibilities: queue-level start/resume/next-item
  lifecycle control, stage-resume orchestration, and bounded rework handoff
  now route through main-agent orchestration.
- If applicable, retained facade responsibilities: `runTaskQueueSequence`
  remains as a compatibility wrapper.
- If applicable, forbidden write-back locations: no Workbench UI,
  confirmation queue, scheduler runtime, terminal, apply/close, remote/merge,
  PR, or Harness evolution imports in the new lifecycle owner.
- If applicable, compatibility surface: existing TaskQueue runner export and
  result shapes are retained.
- If applicable, behavior path tested: successful queue item, resume scope
  rejection, stale graph scope fail-closed, TaskRun lifecycle rework behavior.
- If applicable, follow-up split candidates: queue-level observe/decide
  policy and scheduler/parallel integration remain future changes.
- If applicable, boundary tests or lint checks:
  `tests/unit/workbench-module-boundaries.test.ts` plus targeted runtime
  suites.
- If applicable, compatibility result: behavior preserved; old runner no
  longer owns the loop.
- If applicable, tested with: targeted Vitest suites, `npm run test:fast`,
  `npm run test:workbench`, typecheck, lint, build.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: TaskQueue,
  TaskRun, WorkflowRun, validation/audit, gate scope, and lifecycle transition
  helpers are reused instead of replaced.
- If applicable, new cross-cutting mechanism and owner: no new workflow truth;
  `main-agent-orchestration` owns only the lifecycle control seam.
- If applicable, why existing mechanisms were insufficient: the old runner
  kept queue control outside the main-agent orchestration path, blocking the
  target observe/decide/run-one-leaf/record architecture.
- If applicable, domain-specific logic location: TaskQueue and WorkflowRun
  persistence remain in their existing owners.
- If applicable, shared cross-cutting logic location: gate scope and resume
  checks live in the main-agent lifecycle/stage-resume helpers.
- If applicable, local framework / state machine / projection / validation / gate avoided:
  no UI state machine, no new scheduler framework, no new workflow action
  family, no duplicate persistence ledger.
- If applicable, public API / facade / Workbench compatibility result:
  `runTaskQueueSequence` remains as compatibility wrapper.
- If applicable, future-cost reduction result: future queue-level main-agent
  decisions can attach at one owner instead of patching workflow-runtime.
- If applicable, tested with: targeted architecture and behavior suites.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- If applicable, stale active-path / phase grep: to be checked after archive
  close updates handoff pointers.
- If applicable, latest archive / active path alignment: active path is current
  before close; archive path will be updated after close.
- If applicable, pending evolution state checked:
  `scripts/harness-evolve.ps1 check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
