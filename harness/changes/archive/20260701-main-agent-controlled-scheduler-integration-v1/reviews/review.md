# Review: main-agent-controlled-scheduler-integration-v1

Status: approved.

## Findings

No blocking findings.

## Verification

- Selected verification scope: targeted main-agent scheduler candidate, controlled route, WorkflowGraph observation/replay, module boundary tests plus standard aggregate gates.
- Targeted:
  - `npx vitest run tests/unit/main-agent-scheduler-candidate-assessment.test.ts tests/unit/main-agent-controlled-scheduler-integration.test.ts tests/unit/main-agent-workflowgraph-observation.test.ts tests/unit/main-agent-workflowgraph-replay.test.ts tests/unit/workbench-module-boundaries.test.ts` - passed.
- Aggregate / standard:
  - `npm run typecheck` - passed.
  - `npm run lint` - passed.
  - `npm run test:fast` - passed.
  - `npm run build` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.
- Rationale for selected scope: this change only touches read-only main-agent WorkflowGraph observation/candidate/route code and docs. It does not touch scheduler runtime, Workbench UI, action handlers, confirmation queue, or automation allowlist; slow scheduler/runtime browser suites are not required.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: no legacy Scheduler owner was duplicated; no new Scheduler gate/action bridge path was added.
- reuse: reused existing WorkflowGraph observation/replay/recovery and readiness manifest fields; route helper points to the existing controlled Scheduler owner.
- yagni: avoided Scheduler compile/dry-run/dispatch, SchedulerRun/WorkerLease/IntegrationCheck creation, UI, confirmation card, and action payload generation.
- shrink: chose a narrow read-only route object instead of a new parallel gate assessment artifact.
- net: Lean; one small helper and stricter candidate fields replace looser status-only inference.
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
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: not recorded; edits were bounded current-state handoff updates.
- If applicable, duplicate current-state fields checked: active path and latest archive wording checked by `harness-change status`.
- If applicable, roadmap/current-direction stale language checked: yes; direct "parallel integration next" wording now routes through controlled Scheduler integration first.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: no archive ledger content promoted.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `lint-ecl`, `lint-encoding`, `harness-change reindex/status`.
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
- If applicable, module owners checked: WorkflowGraph observation/replay/recovery, Scheduler candidate assessment, controlled route helper.
- If applicable, moved responsibilities: none; Scheduler runtime remains with existing Scheduler owners.
- If applicable, retained facade responsibilities: `recordMainAgentWorkflowGraphObservationAndReplay(...)` remains the production read-only aggregation helper.
- If applicable, forbidden write-back locations: no writes to SchedulerRun, WorkerLease, IntegrationCheck, WorkflowRun, TaskQueue, TaskRun, SQLite, source root, or Workbench actions.
- If applicable, compatibility surface: helper return type extended; existing callers can ignore the new field.
- If applicable, behavior path tested: candidate hardening, old-schema fail closed, route non-execution.
- If applicable, follow-up split candidates: real parallel integration through existing controlled Scheduler owner.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: existing `test:fast` and build passed.
- If applicable, tested with: targeted Vitest, typecheck, lint, test:fast, build.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: DecompositionReadinessManifest, WorkflowGraph observation evidence, replay/recovery summaries, Scheduler candidate assessment.
- If applicable, new cross-cutting mechanism and owner: one narrow non-executing controlled route helper under main-agent orchestration.
- If applicable, why existing mechanisms were insufficient: status-only Scheduler candidate inference was too weak for later controlled integration.
- If applicable, domain-specific logic location: main-agent orchestration candidate/route files.
- If applicable, shared cross-cutting logic location: no new shared framework.
- If applicable, local framework / state machine / projection / validation / gate avoided: avoided new Scheduler gate, parallel gate assessment, action bridge hook, and UI projection.
- If applicable, public API / facade / Workbench compatibility result: replay helper return field added without changing existing behavior.
- If applicable, future-cost reduction result: later parallel integration has a strict readiness signal and a single allowed path.
- If applicable, tested with: targeted Vitest, boundary tests, typecheck, test:fast.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change summary.
- If applicable, stale active-path / phase grep: current active path intentionally points to this change until close.
- If applicable, latest archive / active path alignment: to be rerun after close when archive path exists.
- If applicable, pending evolution state checked: `harness-evolve check` reports no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

