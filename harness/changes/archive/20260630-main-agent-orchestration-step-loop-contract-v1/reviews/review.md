# Review: main-agent-orchestration-step-loop-contract-v1

Status: completed.

## Findings

Planning review:

- Independent subagent review conclusion: executable after narrowing scope to
  `runner.ts` internal control-flow contract. Do not add Workflow/Scheduler
  runtime or new workflow authority.
- Primary risk: rework semantics. Top-level orchestration may run one automatic
  rework, but TaskRun attempts must remain single-attempt and use existing
  bounded-rework retry ownership.
- Secondary risk: duplicate evidence writes. Leaf stages already record
  orchestration steps and AgentTask/evidence side effects; V1 record must only
  accept returned state.
- Boundary risk: the loop must not observe and act on Scheduler/TaskQueue/
  WorkerLease/IntegrationCheck state.

Implementation review:

- `step-loop.ts` is the only new observe/decide/run/record owner. It delegates
  deterministic policy to the existing `decideNextMainAgentOrchestration()`
  and delegates actual role execution to existing leaf stages.
- `runMainAgentOrchestration()` remains the only entrypoint that can consume
  one top-level automatic rework after validation/audit failure.
- `runMainAgentTaskRunAttempt()` remains single-attempt; bounded retry remains
  outside the main-agent runner.
- Source-refresh and feedback rework entrypoints start at `rework-coder` and
  do not trigger second-layer automatic rework.
- No Workbench UI, confirmation queue, action registry, automation allowlist,
  scheduler, apply/close, terminal, remote, PR, merge, or Harness evolution
  path is imported or changed by the new step loop.

## Verification

- Selected verification scope: targeted orchestration, boundary, workflow,
  fast aggregate, build, Workbench unit contract, and Harness checks.
- Full / aggregate suites run or skipped: `npm run test:fast`,
  `npm run build`, and `npm run test:workbench` were run. Full slow release
  suites were not run because this change is an internal main-agent runner
  refactor with no UI, remote, scheduler wave, or source apply behavior
  changes.
- Rationale for selected scope: the touched boundary is
  `main-agent-orchestration`, with compatibility coverage for workflow action
  and revalidation contracts plus module-boundary grep tests.
- Passed:
  - `npx vitest run tests/unit/main-agent-step-loop.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:fast`
  - `npm run build`
  - `npm run test:workbench`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Notes: initial `npm run typecheck` caught a missing
  `MainAgentOrchestrationState` import in `runner.ts`; fixed and rerun passed.
  Initial `npm run lint` caught `no-explicit-any` in the new unit test; fixed
  with typed mock inputs and rerun passed. Initial `lint-ecl` caught active
  pointer drift in `AGENTS.md` / `docs/STATUS.md`; fixed and rerun passed.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: remove hidden full-sequence control flow/naming from the runner.
- reuse: existing deterministic decision engine, leaf stages, ToolPolicyGate
  path, and exported main-agent entrypoints.
- yagni: avoided free LLM decision policy, scheduler runtime, UI surface,
  persistent journal, and new workflow artifacts.
- shrink: no-op rejected because hidden fixed sequence remains after facade
  retirement; local guards rejected because the shared runner is the root.
- net: Lean if the new owner is limited to internal control-flow separation.
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

- Documentation entropy coverage applicable: yes. Change to `yes` when this change updates `AGENTS.md`, `docs/STATUS.md`, Harness rules/templates, auto-evolve evidence, or other current-state / handoff documents.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change
  summary/spec/plan/tasks/review.
- If applicable, before/after line counts: not recorded; handoff edits were
  active-path pointer updates only.
- If applicable, duplicate current-state fields checked: yes; active change
  pointer aligned in both handoff files and verified by `lint-ecl`.
- If applicable, roadmap/current-direction stale language checked: yes; no
  broad roadmap or baseline wording was changed.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `scripts/lint-ecl.ps1`, `scripts/lint-encoding.ps1`,
  `scripts/harness-change.ps1 reindex`, `scripts/harness-evolve.ps1 check`.
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
- Future feature owner module: `src/main-agent-orchestration/step-loop.ts`.
- If applicable, module owners checked: `main-agent-orchestration` runner,
  deterministic orchestration engine, and leaf stage owner.
- If applicable, moved responsibilities: fixed role sequencing moved from
  runner-local hidden control flow into the internal step-loop owner.
- If applicable, retained facade responsibilities: existing exported runner
  entrypoints and result shapes remain compatible.
- If applicable, forbidden write-back locations: Workbench UI, confirmation
  queue, scheduler/runtime queue, workflow-run runtime, terminal, action
  handlers, apply/close, remote/PR, and Harness evolution.
- If applicable, compatibility surface: `runMainAgentOrchestration`,
  `runMainAgentTaskRunAttempt`, `runMainAgentSourceRefreshRework`,
  `runMainAgentFeedbackRework`, and `CodeValidateAuditAttemptResult` shape.
- If applicable, behavior path tested: success, validation failure with one
  top-level rework, TaskRun single attempt, and source-refresh rework.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks:
  `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: compatible; no production import/use of
  the old full-sequence control naming was restored.
- If applicable, tested with: targeted Vitest suites, typecheck, lint,
  test:fast, build, test:workbench, Harness checks.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened:
  `decideNextMainAgentOrchestration`, existing leaf stages, ToolPolicyGate and
  role dispatch side-effect path, existing runner entrypoints.
- If applicable, new cross-cutting mechanism and owner:
  `main-agent-orchestration/step-loop.ts` as a narrow internal orchestration
  control owner.
- If applicable, why existing mechanisms were insufficient: runner still held
  hidden full-sequence control flow after facade retirement, keeping old
  pipeline mental model alive.
- If applicable, domain-specific logic location: deterministic step-loop
  orchestration stays in `src/main-agent-orchestration`.
- If applicable, shared cross-cutting logic location: unchanged; ToolPolicy,
  AgentTask lifecycle, run/validation/audit evidence, action revalidation, and
  Harness gates remain in their existing owners.
- If applicable, local framework / state machine / projection / validation / gate avoided:
  no new UI projection, persistent journal, scheduler framework, action type,
  validation gate, or workflow truth layer was added.
- If applicable, public API / facade / Workbench compatibility result: public
  runner entrypoints keep existing external behavior and no Workbench UI was
  changed.
- If applicable, future-cost reduction result: future WorkflowPlan/TaskGraph
  and parallel-worker integration can attach to a single observe/decide/run
  seam instead of patching a monolithic fixed pipeline.
- If applicable, tested with: targeted orchestration and module boundary tests.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes. Change to `yes` when this change alters active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended work.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active
  change summary/review.
- If applicable, stale active-path / phase grep: checked through
  `scripts/lint-ecl.ps1`.
- If applicable, latest archive / active path alignment: active path aligned
  before close; latest archive alignment must be rechecked after close.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check`
  reported no pending evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

