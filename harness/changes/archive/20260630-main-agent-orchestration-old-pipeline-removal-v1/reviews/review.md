# Review: main-agent-orchestration-old-pipeline-removal-v1

Status: passed.

## Findings

- No blocking findings.
- `runMainAgentToolOrchestration` now routes through
  `src/main-agent-orchestration`.
- The old `runCodeValidateAuditSequence` export remains only as a compatibility
  facade and does not contain code/validation/audit stage control.
- Leaf stage functions run one role at a time and do not import the decision
  engine, scheduler runtime, Workbench actions, terminal, or apply/close.
- Confirmation queue, scoped automation allowlist, action revalidation,
  TaskQueue/task-run compatibility, Workbench UI, apply/close, remote, PR,
  merge, and Harness evolution were not expanded.

## Verification

Selected scope: architecture migration plus broad Workbench regression gate.

- Selected verification scope: targeted orchestration/action tests, typecheck,
  lint, fast suite, build, Workbench aggregate unit gate, and Harness checks.
- Full / aggregate suites run or skipped: full `npm run test` skipped because
  this change does not alter integration apply/remote/provider/browser runtime;
  `npm run test:fast` plus `npm run test:workbench` cover the touched shared
  runtime and Workbench boundaries.
- Rationale for selected scope: the change moves internal controller ownership
  while preserving existing action and Workbench surfaces.
- `npm run typecheck`: passed.
- `npx vitest run tests/unit/orchestration-engine.test.ts tests/unit/workbench-agent-task-domain.test.ts tests/unit/workbench-module-boundaries.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run build`: passed.
- `npm run test:workbench`: passed.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing decision engine, RoleDispatcher, ToolPolicyGate, AgentTask
  lifecycle, code/validation/audit run owners, boundary audit, maintenance
  ledger, live event sink, action revalidation, and automation allowlist.
- yagni: avoided free-form agent loop, new UI, new action type, new workflow
  truth, ODWF runtime, scheduler changes, and provider changes.
- shrink: old export kept as compatibility facade instead of forcing all legacy
  call sites into one high-risk edit.
- net: Lean for this migration slice.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly required removing old
  full-sequence ownership rather than decorating the old pipeline.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active
  change files.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: current docs
  already describe the phased main-agent continuous orchestration roadmap.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: no archive implementation details promoted into current docs.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `lint-ecl`, `lint-encoding`.
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
- If applicable, checked scope: role pipeline/orchestration result compatibility
  and Workbench aggregate unit gate.
- If applicable, tested with: `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: no intentional UI changes; confirmation and
  transcript non-regression covered by Workbench unit gate.
- If applicable, visible primary UI backed by implemented workflow paths: no new
  visible UI/control added.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation queue tests and Workbench gate retained.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: not applicable.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: not applicable.
- If applicable, tested with: `npm run test:workbench`, targeted action tests.
- If not applicable, reason: not applicable.

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
- If applicable, recommendation authority checked: new owner reuses existing
  non-authoritative decision evidence and does not change Goal Loop projection
  authority.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: no new action type,
  allowlist, scheduler, terminal, or apply/close path added.
- If applicable, ToolPolicyGate / human gate preservation checked: leaf stages
  continue using `dispatchForegroundRoleTask`.
- If applicable, tested with: targeted action tests, Workbench gate.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/main-agent-orchestration`.
- If applicable, module owners checked: demand-worker, workflow-runtime facade,
  leaf stages, runner.
- If applicable, moved responsibilities: sequence-level observe/decide/run loop
  moved out of `workflow-runtime/kernel/role-stage-runner.ts`.
- If applicable, retained facade responsibilities: `runCodeValidateAuditSequence`
  remains only for compatibility.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: task-run sequence, refresh rework, and
  remote handoff rework keep the old function signature.
- If applicable, behavior path tested: coder setup failure, action/revalidation,
  Workbench demand worker/task runtime.
- If applicable, follow-up split candidates: free main-agent loop,
  journal/recovery, scheduler/parallel integration.
- If applicable, boundary tests or lint checks: `workbench-module-boundaries`
  source assertions.
- If applicable, compatibility result: old callers continue through facade.
- If applicable, tested with: targeted tests, `test:fast`, `test:workbench`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: decision engine,
  RoleDispatcher, ToolPolicyGate, AgentTask lifecycle, run owners, boundary
  audit, maintenance ledger, live events.
- If applicable, new cross-cutting mechanism and owner:
  `src/main-agent-orchestration` owns main-agent sequence control.
- If applicable, why existing mechanisms were insufficient: old kernel runner
  owned too much stage sequencing and blocked clean continuous-loop migration.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: not applicable.
- If applicable, public API / facade / Workbench compatibility result: not applicable.
- If applicable, future-cost reduction result: not applicable.
- If applicable, tested with: targeted architecture tests and aggregate gates.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: not applicable.
- If applicable, stale active-path / phase grep: not applicable.
- If applicable, latest archive / active path alignment: not applicable.
- If applicable, pending evolution state checked: not applicable.
- If not applicable, reason: change does not alter active phase, product baseline, Harness rules/templates, active/pending state, latest archive, or next recommended track.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

