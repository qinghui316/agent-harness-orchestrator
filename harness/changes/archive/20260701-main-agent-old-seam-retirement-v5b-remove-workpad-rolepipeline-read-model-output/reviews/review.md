# Review: main-agent-old-seam-retirement-v5b-remove-workpad-rolepipeline-read-model-output

Status: reviewed.

## Findings

No blocking findings.

- Workpad public read-model output now uses only `mainAgentExecution`.
- Legacy `rolePipeline` was removed from Workpad backend/Web DTOs and Workpad
  consumer fallback paths.
- `role.pipeline.*`, `MainAgentLoopProjection`, Scheduler, IntegrationCheck,
  confirmation/revalidation, automation, apply/close, remote, PR, merge, and
  Harness evolution authority remain unchanged.

## Verification

Passed.

- Selected verification scope: targeted Workbench read-model/UI/boundary/action
  suites plus standard product gates.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts tests/unit/workbench-agent-task-domain.test.ts` - passed.
- `npx vitest run tests/unit/orchestration-engine.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed; Vite reported the existing chunk-size warning.
- `npm run test:workbench` - passed.
- Full / aggregate suites run or skipped: `npm run test` skipped because this
  is a narrow read-model DTO deletion covered by targeted Workbench/action
  suites, `test:fast`, build, and `test:workbench`.
- Rationale for selected scope: touched boundaries are Workpad DTO/read-model
  output, Workpad UI/projection consumers, confirmation suppression, decision
  inspector, Agent graph, and action-seam boundary tests.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: Workpad public `rolePipeline` field output and legacy fallback.
- reuse: existing role execution summary builder and `mainAgentExecution` wire
  shape.
- yagni: avoided schema redesign, new evidence, new UI, action-id deletion,
  Scheduler/IntegrationCheck changes, and authority changes.
- shrink: deleted a dual-field output seam rather than adding another adapter.
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
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, and V5a archived `summary.md`.
- If applicable, before/after line counts: not recorded; edits are bounded
  current-handoff and roadmap wording.
- If applicable, duplicate current-state fields checked: active V5b path and
  latest V5a archive pointers.
- If applicable, roadmap/current-direction stale language checked: V5b is
  documented as read-model field removal only.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: V5a history retained archive-only except one wording correction.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: Harness lint and reindex checks passed.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- If applicable, promote decisions: `mainAgentExecution` remains the canonical
  Workpad read-model field.
- If applicable, retain decisions: `role.pipeline.*` action aliases, internal
  demand-worker `rolePipeline`, and `MainAgentLoopProjection`.
- If applicable, merge decisions: Workpad consumers now converge on
  `mainAgentExecution`.
- If applicable, retire decisions: Workpad public `rolePipeline` DTO/output and
  fallback.
- If applicable, archive-only decisions: V5a dual-field compatibility is now
  archive history.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: targeted suites and Harness lint/reindex checks.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: Workpad public read-model output,
  confirmation suppression, decision inspector, Agent graph, and Workpad UI.
- If applicable, tested with: targeted Workbench read-model/UI suites and
  `npm run test:workbench`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: Workpad role execution rows/details and
  confirmation suppression.
- If applicable, visible primary UI backed by implemented workflow paths:
  unchanged; no new controls.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: targeted tests cover suppression and inspector behavior.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: no new
  user-facing `rolePipeline` surface.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `web-app.test.tsx` and `workbench-read-model.test.ts`.
- If applicable, tested with: targeted suites and `npm run test:workbench`.

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
- Future feature owner module: Workbench read-model and Workpad frontend
  projection surfaces.
- If applicable, module owners checked: `src/workbench/projections/read-model/*`
  and `src/web/src/panels/workbench/workpad/*`.
- If applicable, moved responsibilities: none.
- If applicable, retained facade responsibilities: action aliases and internal
  demand-worker compatibility remain.
- If applicable, forbidden write-back locations: Scheduler, IntegrationCheck,
  action registry semantics, automation, ToolPolicy, apply/close untouched.
- If applicable, compatibility surface: `role.pipeline.*` action aliases remain.
- If applicable, behavior path tested: Workpad snapshot, confirmation
  suppression, decision inspector, Agent graph, frontend rendering.
- If applicable, follow-up split candidates: V5c action alias assessment.
- If applicable, boundary tests or lint checks: module-boundary tests and
  Harness lint/reindex checks.
- If applicable, compatibility result: Workpad public `rolePipeline` removed;
  action aliases retained.
- If applicable, tested with: targeted suites and standard gates.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing
  `mainAgentExecution` summary and Workbench read-model projection.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: legacy public field
  was the seam being retired.
- If applicable, domain-specific logic location: Workbench read-model and
  Workpad frontend surfaces.
- If applicable, shared cross-cutting logic location: existing summary builder.
- If applicable, local framework / state machine / projection / validation / gate avoided: yes.
- If applicable, public API / facade / Workbench compatibility result:
  canonical Workpad field only.
- If applicable, future-cost reduction result: future consumers no longer need
  legacy fallback.
- If applicable, tested with: targeted suites and standard gates.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: active path points to V5b.
- If applicable, latest archive / active path alignment: V5a remains latest
  archive while V5b is active.
- If applicable, pending evolution state checked: no pending evolution before
  implementation.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

