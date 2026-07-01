# Review: main-agent-controlled-scheduler-worker-runtime-backflow-v1b

Status: approved.

## Findings

No blocking findings.

Notes:

- The new worker backflow owner is read-only and is attached only as
  `controlledSchedulerStateBackflow.workerBackflow`.
- IntegrationCheck handoff/outcome/completion remains deferred to V1c.
- Existing SchedulerRuntime / WorkerLease owners remain authoritative for
  execution and evidence writes.

## Verification

- Selected verification scope:
  - `npx vitest run tests/unit/main-agent-controlled-scheduler-worker-backflow.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/main-agent-workflowgraph-decision-policy.test.ts tests/unit/workbench-module-boundaries.test.ts`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
- Full / aggregate suites run or skipped: `test:fast` and `build` passed; no
  browser screenshot acceptance was needed because this is a non-UI
  architecture/read-model change.
- Rationale for selected scope: coverage targets the new worker backflow owner,
  replay/policy gap propagation, module boundaries, and broad fast regression
  without invoking slow UI acceptance paths.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: reused existing WorkerLease and SchedulerRuntime repository/projection
  readers plus V1a `controlledSchedulerStateBackflow`.
- yagni: avoided new Scheduler gate, action bridge integration, UI, executor,
  IntegrationCheck reader, and public runtime API.
- shrink: kept worker posture as a child summary and health source instead of a
  new replay/policy owner.
- net: Lean already.
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
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: not measured; changes were small
  current-handoff pointer updates.
- If applicable, duplicate current-state fields checked: active change pointers
  align on the same active path.
- If applicable, roadmap/current-direction stale language checked: V1b scope
  and V1c IntegrationCheck deferral are explicit.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: archive history unchanged.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: targeted grep/status checks plus Harness reindex/status during implementation.
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
- Future feature owner module:
  `src/main-agent-orchestration/controlled-scheduler-worker-backflow.ts`.
- If applicable, module owners checked: WorkerLease and SchedulerRuntime
  repository/projection readers remain the only data sources; executor owners
  are not imported.
- If applicable, moved responsibilities: none; this only adds read-only
  backflow summary.
- If applicable, retained facade responsibilities: existing controlled
  Scheduler execution bridge and SchedulerRuntime owners unchanged.
- If applicable, forbidden write-back locations: source root, SQLite,
  SchedulerRun, WorkerLease, IntegrationCheck, Workbench actions, automation
  allowlist, apply/close.
- If applicable, compatibility surface: replay summary now exposes
  `controlledSchedulerStateBackflow.workerBackflow`; no UI or action surface.
- If applicable, behavior path tested: happy worker chain, rework chain,
  incomplete worker, scope mismatch, malformed worker JSON, replay gap
  propagation.
- If applicable, follow-up split candidates: IntegrationCheck backflow V1c.
- If applicable, boundary tests or lint checks:
  `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: existing replay/policy behavior remains
  unchanged when no worker evidence exists.
- If applicable, tested with: targeted Vitest, `typecheck`, `lint`,
  `test:fast`, `build`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened:
  `controlledSchedulerStateBackflow`, SchedulerRuntime repository readers,
  WorkerLease repository reader, replay health/gap model, decision policy
  fail-closed gap handling.
- If applicable, new cross-cutting mechanism and owner: one narrow read-only
  worker backflow owner.
- If applicable, why existing mechanisms were insufficient: V1a only summarized
  SchedulerRun/runtime/controlled-step state and did not expose worker/rework
  posture or unsafe worker evidence gaps.
- If applicable, domain-specific logic location: main-agent orchestration
  read-model backflow.
- If applicable, shared cross-cutting logic location: replay health/gap and
  decision-policy remain shared consumers.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new gate, state machine, action type, UI, or executor.
- If applicable, public API / facade / Workbench compatibility result:
  unchanged; child summary is internal replay data.
- If applicable, future-cost reduction result: V1c IntegrationCheck backflow can
  consume the same replay health/gap pattern without reading worker artifacts
  ad hoc.
- If applicable, tested with: targeted Vitest, `typecheck`, `lint`,
  `test:fast`, `build`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: active pointers currently point
  at this change before close.
- If applicable, latest archive / active path alignment: to be finalized by
  close.
- If applicable, pending evolution state checked: no pending evolution at start.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

