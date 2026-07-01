# Review: main-agent-controlled-scheduler-step-ownership-bridge-v1

Status: approved.

## Findings

Pre-implementation review:

- Subagent Herschel result: revise, not blocker. Required the executable wrapper
  to live outside the non-executing route file, required active Change path
  validation before pre-observation, and required explicit failure semantics.
- Subagent Maxwell result: keep `controlledSchedulerRoute` non-blocking in V1
  because existing Workbench revalidation and controlled Scheduler runtime
  already fail closed on the executable boundary.

## Verification

- Selected verification scope: bridge unit tests, scheduler controlled-advance
  owner/regression suites, Workbench module boundary tests, typecheck, lint,
  `test:fast`, build, and Harness checks.
- Full / aggregate suites run or skipped: full `npm run test` skipped because
  this is a narrow ownership bridge with no UI, provider, apply/close, remote,
  or broad Workbench shell behavior change; `test:fast` plus targeted Scheduler
  and boundary suites cover the touched runtime/action boundary.
- Rationale for selected scope: the touched surface is the controlled Scheduler
  advance handler, main-agent bridge ownership, and module imports.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

Commands run:

- `npx vitest run tests/unit/main-agent-controlled-scheduler-step-bridge.test.ts tests/unit/workbench-module-boundaries.test.ts` passed.
- `npx vitest run tests/unit/controlled-scheduler-advance-post-step.test.ts tests/unit/controlled-scheduler-loop-step-owner.test.ts tests/unit/controlled-scheduler-boundary-continuation.test.ts tests/unit/controlled-scheduler-current-transition-owner.test.ts tests/unit/action-revalidation.test.ts tests/unit/main-agent-scheduler-candidate-assessment.test.ts` passed after updating the old post-step test fixture to mock the new observation helper.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed.
- `npm run test:workbench` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed after closeout updates.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` reported close-ready.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing owner/helper/mechanism used: controlled Scheduler runtime,
  Workbench revalidation, high-impact audit, and WorkflowGraph
  observation/replay helper.
- yagni: avoided: no new action type, UI, route authority, Scheduler gate, or
  state machine.
- shrink: simpler alternative checked: direct handler call retained would not
  migrate ownership; blocking on route was rejected as premature authority.
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
- If applicable, before/after line counts: not recorded; edits are bounded
  handoff/current-direction updates.
- If applicable, duplicate current-state fields checked: active/latest archive
  fields checked by ECL status/lint.
- If applicable, roadmap/current-direction stale language checked: planned
  closeout updates move controlled Scheduler bridge from next step to completed.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: retained archive ledger; only current handoff language changes.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: ECL lint/status/reindex after updates.
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

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: existing controlled scheduler advance scope
  remains enforced by Workbench revalidation and scheduler runtime; no new target
  ids or payload shape added.
- If applicable, tested action path: `action-revalidation.test.ts`,
  controlled scheduler owner/post-step suites, and bridge tests.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: no UI/action affordance changes.
- If not applicable, reason: not applicable.

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
- If applicable, persistent Goal/Change scope checked: active Change path is
  resolved before pre-observation and existing scheduler runtime validates
  same-Change controlled advance scope.
- If applicable, recommendation authority checked: `controlledSchedulerRoute`
  remains non-blocking evidence, not recommendation authority.
- If applicable, fallback priority checked: existing controlled scheduler
  runtime guards remain authority.
- If applicable, packet / main-Agent context freshness checked: existing
  controlled scheduler owner tests cover packet/controller/preflight refresh.
- If applicable, stale or superseded packet suppression checked:
  `action-revalidation.test.ts` and controlled scheduler tests.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not changed.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not changed.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not changed.
- If applicable, hidden execution / source mutation check: no new execution path
  beyond one existing controlled scheduler delegate.
- If applicable, ToolPolicyGate / human gate preservation checked: no allowlist
  or confirmation queue changes; existing high-impact audit remains in handler
  controlled-step path.
- If applicable, tested with: controlled scheduler owner tests,
  `action-revalidation.test.ts`, bridge tests.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module:
  `src/main-agent-orchestration/controlled-scheduler-step-bridge.ts`.
- If applicable, module owners checked: main-agent bridge owns observation
  sandwich; scheduler runtime owns the transition.
- If applicable, moved responsibilities: direct Workbench-to-scheduler runtime
  controlled-advance call moved to main-agent bridge.
- If applicable, retained facade responsibilities: Workbench handler retains
  action dispatch and service wiring.
- If applicable, forbidden write-back locations: confirmationQueue, action
  registry, revalidation, allowlist, UI, apply/close, remote/PR/merge.
- If applicable, compatibility surface: result shape unchanged.
- If applicable, behavior path tested: bridge unit tests and controlled
  scheduler regression suites.
- If applicable, follow-up split candidates: result/policy consumption and old
  seam retirement.
- If applicable, boundary tests or lint checks:
  `tests/unit/workbench-module-boundaries.test.ts`.
- If applicable, compatibility result: passed targeted suites and `test:fast`.
- If applicable, tested with: targeted vitest, typecheck, lint, test:fast, build.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: controlled
  scheduler runtime, controlled-step dispatch, Workbench revalidation, high
  impact audit, and WorkflowGraph observation/replay helper.
- If applicable, new cross-cutting mechanism and owner: narrow bridge only.
- If applicable, why existing mechanisms were insufficient: direct Workbench
  runtime call left main-agent ownership incomplete.
- If applicable, domain-specific logic location: scheduler owners unchanged.
- If applicable, shared cross-cutting logic location: main-agent observation
  helper unchanged.
- If applicable, local framework / state machine / projection / validation / gate avoided: yes.
- If applicable, public API / facade / Workbench compatibility result: result
  shape unchanged.
- If applicable, future-cost reduction result: future controlled Scheduler
  consumption can attach to one bridge.
- If applicable, tested with: targeted vitest, typecheck, lint, test:fast, build.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: planned before close.
- If applicable, latest archive / active path alignment: planned with
  `harness-change status`.
- If applicable, pending evolution state checked: `harness-evolve check`.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
