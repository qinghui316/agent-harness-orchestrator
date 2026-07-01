# Review: main-agent-old-seam-retirement-v5a-rolepipeline-read-model-canonicalization

Status: reviewed.

## Findings

No blocking findings.

- `mainAgentExecution` uses the same wire shape as legacy `rolePipeline`.
- Workbench read-model construction builds one summary and exposes both fields.
- Backend and frontend consumers use canonical-first fallback.
- Legacy seams remain compatibility-only and no Harness authority boundary was
  changed.

## Verification

Passed.

- Selected verification scope: targeted Workbench read-model/UI/boundary/action
  suites plus standard product and Harness gates.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workbench-module-boundaries.test.ts tests/unit/orchestration-engine.test.ts tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed after replacing explicit `any` in the new UI fixture.
- `npm run test:fast` - passed.
- `npm run build` - passed; Vite reported the existing chunk-size warning.
- `npm run test:workbench` - passed.
- Full / aggregate suites run or skipped: `npm run test` skipped because this
  change is a read-model compatibility alias with targeted Workbench/action
  coverage plus `test:fast`, build, and Workbench aggregate coverage.
- Rationale for selected scope: touched boundaries are Workbench read-model DTOs,
  Workpad frontend rendering, confirmation suppression, decision inspector,
  Agent graph projection, and action-seam boundary tests.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none in V5a; deletion is deferred until compatibility evidence proves
  `rolePipeline` can be removed.
- reuse: existing Workbench role execution summary builder and projection
  consumers.
- yagni: avoided schema redesign, evidence families, action ids, Scheduler,
  IntegrationCheck, UI layout, and authority changes.
- shrink: canonical field plus fallback helpers rather than broad renaming.
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
  active-slice handoff updates.
- If applicable, duplicate current-state fields checked: active change path and
  V5a next-step wording.
- If applicable, roadmap/current-direction stale language checked: V4/V5 wording
  updated to active V5a read-model canonicalization.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: retained V4 archive as previous closeout; active V5a linked as current.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: pending Harness lint.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: retain `rolePipeline`, `role.pipeline.*`,
  and `MainAgentLoopProjection` as live compatibility/boundary seams in V5a.
- If applicable, merge decisions: merge new consumers onto
  `mainAgentExecution` canonical field.
- If applicable, retire decisions: retire direct production consumer reads of
  `workpad.rolePipeline` outside fallback helpers.
- If applicable, archive-only decisions: historical V4 details remain archived.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: targeted tests and pending Harness lint.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: Workpad role execution summary, confirmation
  suppression, decision inspector, Agent graph, and Workpad UI.
- If applicable, tested with: targeted Vitest suites and `npm run test:workbench`.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: Workpad parent-agent role execution rows and
  diagnostic details.
- If applicable, visible primary UI backed by implemented workflow paths:
  unchanged; no new controls added.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation suppression and decision inspector covered by tests.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: no new
  "role pipeline" user wording added; `角色流水线` remains forbidden in boundary
  test.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `web-app.test.tsx` renders canonical summary over legacy fallback.
- If applicable, tested with: targeted Vitest suites and `npm run test:workbench`.

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
- If applicable, retained facade responsibilities: legacy field output and
  fallback compatibility.
- If applicable, forbidden write-back locations: Scheduler, IntegrationCheck,
  action registry semantics, automation, ToolPolicy, apply/close untouched.
- If applicable, compatibility surface: `rolePipeline` remains legacy output.
- If applicable, behavior path tested: Workpad snapshot, confirmation
  suppression, decision inspector, Agent graph, frontend rendering.
- If applicable, follow-up split candidates: V5b legacy field deletion
  assessment.
- If applicable, boundary tests or lint checks: module-boundary tests and
  Harness lint.
- If applicable, compatibility result: legacy fallback remains.
- If applicable, tested with: targeted suites and standard gates.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: Workbench role
  execution summary projection.
- If applicable, new cross-cutting mechanism and owner: no new framework; only
  tiny fallback helpers.
- If applicable, why existing mechanisms were insufficient: old field name was
  the seam being retired.
- If applicable, domain-specific logic location: Workbench read-model and
  Workpad frontend surfaces.
- If applicable, shared cross-cutting logic location: canonical-first fallback
  helpers.
- If applicable, local framework / state machine / projection / validation / gate avoided: yes.
- If applicable, public API / facade / Workbench compatibility result:
  canonical field added, legacy field retained.
- If applicable, future-cost reduction result: new consumers can target
  `mainAgentExecution`.
- If applicable, tested with: targeted suites and standard gates.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: active path updated to V5a.
- If applicable, latest archive / active path alignment: V4 remains latest
  closeout; V5a is active follow-up.
- If applicable, pending evolution state checked: no pending evolution before
  implementation.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

