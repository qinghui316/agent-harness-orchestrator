# Review: scheduler-worker-path-read-model-compression-v0

Status: approved.

## Findings

No blocking findings.

## Verification

Passed.

- Selected verification scope: targeted read-model, transition, closeout, and
  boundary tests; aggregate fast, Workbench, build, typecheck, and lint; slow
  two-worker Scheduler acceptance.
- Full / aggregate suites run or skipped: `npm run test:fast`,
  `npm run test:workbench`, `npm run build`, `npm run typecheck`, and
  `npm run lint` passed. Full `npm run test` was not run because this change
  is a bounded Scheduler read-model compression and the aggregate
  runtime/Workbench suites plus the slow Scheduler flow cover the touched
  boundary.
- Rationale for selected scope: this change moves duplicated worker-path
  evidence assembly into one read-only owner without changing product behavior.
  Coverage therefore targets canonical facts, consumer parity, old-helper
  deletion, and Scheduler end-to-end gate behavior.
- If an aggregate Workbench / slow suite exceeded the tool window: the first
  slow two-worker run hit a 184s tool timeout before Vitest reported. The same
  command passed with a 360s timeout in 175.64s, with the test body taking
  161.57s. This is verification runtime cost, not product failure.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: duplicated private worker-path assembly helpers were removed or
  compressed from workflow-runtime Scheduler, Workbench boundary, GoalLoop
  compiler, Scheduler closeout, and Workbench projection paths.
- reuse: existing scheduler-runtime repositories and workflow-actions
  Scheduler current-transition contract are reused; no new transition policy
  owner was added.
- yagni: avoided Scheduler feature expansion, whole-wave dispatch,
  WorkflowGraphPlan schema changes, Plan UI, Codex subagent, remote/apply/merge
  automation, and write-capable read-model behavior.
- shrink: a no-op would keep five policy forks; a runtime-owned reader would
  couple evidence reading to dispatch. The chosen read-only scheduler-runtime
  owner is the smallest coherent relationship.
- net: Product behavior is unchanged; duplicated policy sites are reduced even
  though a canonical read-model module and tests were added.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: slow two-worker acceptance needed a longer
  tool timeout; rerun passed.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active
  change summary/review/tasks.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: yes; final
  handoff should point to this archive and avoid skipping past worker-path
  compression.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: ECL and encoding lint during final closeout.
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

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: Scheduler worker path summaries now map from
  canonical `scheduler-runtime` read models; projection remains read-only and
  does not own Scheduler status rules.
- If applicable, tested with: `npm run test:workbench`, `npm run test:fast`,
  targeted boundary tests, and the slow two-worker Scheduler flow.
- If not applicable, reason: not applicable.

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

- Goal Loop boundary coverage applicable: yes.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: GoalLoop compiler consumes
  canonical worker-path read models as read-only evidence/context and does not
  own Scheduler transition or dispatch authority.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: canonical read-model
  consumption creates no TaskRun, WorkerLease, worktree, CodeRun, artifact, or
  IntegrationCheck.
- If applicable, ToolPolicyGate / human gate preservation checked: runtime
  dispatch still owns pre-dispatch stale/barrier/source checks and existing
  gates are unchanged.
- If applicable, tested with: `npm run test:fast`, targeted boundary tests.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/scheduler-runtime/worker-path-read-model.ts`
  owns read-only Scheduler worker-path evidence interpretation.
- If applicable, module owners checked: scheduler-runtime owns evidence read
  model; workflow-actions owns transition contract; workflow-runtime owns
  dispatch revalidation; Workbench/GoalLoop/projection consume read-only facts.
- If applicable, moved responsibilities: terminal/pending classification,
  approved refs, evidence refs, and reservation scoping moved out of private
  consumer helpers.
- If applicable, retained facade responsibilities: workflow-runtime still
  performs authoritative stale/reservation/source-scope/barrier checks before
  dispatch.
- If applicable, forbidden write-back locations: read model, Workbench
  projection, Workbench boundary, and GoalLoop compiler do not create TaskRuns,
  WorkerLeases, worktrees, CodeRuns, IntegrationChecks, or artifacts.
- If applicable, compatibility surface: public action ids, payloads,
  confirmation queue, and Workbench summary shape remain unchanged.
- If applicable, behavior path tested: same-wave/current-transition, closeout,
  Workbench projection, and slow two-worker Scheduler flow.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: `workbench-module-boundaries`
  forbids old private assembly helpers and locks the shared owner.
- If applicable, compatibility result: unchanged product behavior with fewer
  duplicated policy sites.
- If applicable, tested with: targeted unit/boundary tests, `npm run
  test:fast`, `npm run test:workbench`, and slow two-worker acceptance.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened:
  scheduler-runtime repositories, worker-path domain facts, and
  workflow-actions current transition contract.
- If applicable, new cross-cutting mechanism and owner: canonical
  scheduler-runtime worker-path read model.
- If applicable, why existing mechanisms were insufficient: existing helpers
  did not provide one full worker-path view with status, terminal,
  pendingReason, approved refs, reservation scope, and evidence refs for all
  consumers.
- If applicable, domain-specific logic location: Scheduler evidence
  interpretation stays in scheduler-runtime.
- If applicable, shared cross-cutting logic location: transition matching
  remains in workflow-actions and dispatch authority remains in
  workflow-runtime.
- If applicable, local framework / state machine / projection / validation /
  gate avoided: no new Scheduler state machine, UI authority, action id,
  WorkflowGraphPlan branch, or dispatch loop was added.
- If applicable, public API / facade / Workbench compatibility result:
  unchanged public action ids, payloads, and Workbench summaries.
- If applicable, future-cost reduction result: future Scheduler wave/graph
  work updates one worker-path fact owner instead of five private consumers.
- If applicable, tested with: read-model unit tests, module-boundary tests,
  aggregate suites, and slow Scheduler acceptance.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- If applicable, stale active-path / phase grep: pending final archive update.
- If applicable, latest archive / active path alignment: pending final archive
  update.
- If applicable, pending evolution state checked: pending final
  `harness-evolve.ps1 check`.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

