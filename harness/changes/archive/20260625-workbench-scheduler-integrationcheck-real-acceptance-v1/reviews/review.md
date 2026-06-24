# Review: workbench-scheduler-integrationcheck-real-acceptance-v1

Status: approved. Real acceptance and mechanical verification passed; ready to close.

## Findings

- No blocking IntegrationCheck product failure found in the final E-drive acceptance.
- Product fixes made during acceptance:
  - Bounded continuation no longer hangs at `maxSteps` while refreshing the next gate.
  - `planning.scheduler.integration-check.run` remains a manual gate and is not wrapped by controlled continuation / full-access automation.
- Follow-up planning quality issue: the real demand asked for two source-file changes and no `tests/labels.test.ts` or `src/index.ts` edits, but planning/decomposition produced extra test-related work/diffs. This did not block IntegrationCheck, but it should be treated as planning/decomposition honesty debt before widening scheduler automation.

## Verification

- Selected verification scope: targeted automation runtime and Workbench Goal Loop surface tests, plus typecheck/lint/test/build, Workbench aggregate, and Harness checks.
- Full / aggregate suites run or skipped: `npm run test:workbench` passed.
- Rationale for selected scope: product changes are bounded to continuation runtime finalization and Workbench projection of scheduler IntegrationCheck as a manual gate.
- If an aggregate Workbench / slow suite exceeded the tool window: no aggregate timeout occurred for `npm run test:workbench`.
- Commands passed:
  - `npx vitest run tests/unit/automation-runtime.test.ts`
  - `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/workbench-goal-loop-surface.test.ts`
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

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes, through Workbench/Codex scheduler worker runs in the external E-drive sandbox.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: no fake Codex, mocked PATH, fixture result, or hand-written IntegrationCheck artifact was used for the final pass.
- Manual config edits: AHO_HOME was set to `E:\aho-accept\scheduler-integrationcheck-v1g\home` before launching Workbench.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: v1f used default AHO home and placed integration worktrees under the user profile; v1g reran with E-drive AHO home and passed.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4347/`
  - Source: `E:\aho-accept\scheduler-integrationcheck-v1g\src`
  - Runtime home: `E:\aho-accept\scheduler-integrationcheck-v1g\home`
  - Scheduler run: `scheduler-run-20260624201437-93545e84`
  - Integration candidate: `scheduler-integration-candidate-c71d788b`
  - IntegrationCheck handoff: `scheduler-integration-check-handoff-05603c60`
  - Apply check: `apply-check-20260624205104-80da3aab`
  - Aggregate validation: passed
  - Aggregate audit: approved
  - Final gate: existing `integration-apply` apply/discard gate
- External source/state safety: source root stayed clean after IntegrationCheck; apply/close/merge did not run.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: checked during closeout; current docs remain handoff maps rather than archive ledgers.
- If applicable, duplicate current-state fields checked: active path, latest product archive, pending evolution, and next work were aligned.
- If applicable, roadmap/current-direction stale language checked: active IntegrationCheck acceptance language was replaced with archived-baseline language.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: detailed v1f/v1g sandbox history remains archive-only; only the new scheduler IntegrationCheck baseline and follow-up planning honesty risk are retained in current docs.
- If applicable, over-budget documents and rationale: no new long archive narrative was added to current handoff docs.
- If applicable, tested with: `lint-ecl`, `lint-encoding`, `harness-change status`, and stale active-path grep.
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
- If applicable, checked scope: `planning.scheduler.integration-check.run` remains the primary manual gate and is not converted into `planning.goal-loop.controlled-continue.run`.
- If applicable, tested with: `tests/unit/workbench-goal-loop-surface.test.ts`, real Workbench snapshot/UI acceptance.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: real browser Workbench UI at `http://127.0.0.1:4347/`.
- If applicable, visible primary UI backed by implemented workflow paths: yes; the IntegrationCheck primary gate was backed by `planning.scheduler.integration-check.run`.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: yes for final visible card; final primary was `integration-apply`.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: raw scheduler actions were not added to full-access automation; apply/discard remained explicit human gates.
- If applicable, forbidden visible internal terms/actions checked: not applicable.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: no source apply, close, merge, remote, or Harness evolution action was executed automatically.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: final UI exposed `确认应用到项目`, `要求修改`, `放弃`, `查看证据`.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `workbench-goal-loop-surface` unit coverage added.
- If applicable, tested with: real Workbench browser path and targeted unit tests.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: `changeId`, `schedulerRunId`, `schedulerIntegrationCandidateId`, `worktreeIds`, validation/audit run ids, and apply check id were present in snapshots/artifacts.
- If applicable, tested action path: registered Workbench server action path with stale revalidation, plus real UI evidence.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
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

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: `E:\aho-accept\scheduler-integrationcheck-v1g\src`.
- If applicable, checked runtime home / external managed-project isolation: `E:\aho-accept\scheduler-integrationcheck-v1g\home`; worker and integration worktrees were under this E-drive home.
- If applicable, checked worktree ids / result ids / integration check ids: `wt-20260625-044626-e299a6`, `wt-20260625-042651-4b4dc1`, `scheduler-integration-candidate-c71d788b`, `apply-check-20260624205104-80da3aab`.
- If applicable, source-root mutation gate checked: source `git status --short` stayed empty before any apply action.
- If applicable, out-of-scope source mutation check: no automatic apply/close/merge/remote/Harness evolution occurred.
- If applicable, tested with: real IntegrationCheck acceptance and source git status.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: real Codex worker runs, validation/audit runs, and IntegrationCheck worktree stayed under external AHO home; source root was not mutated.
- If applicable, tested with: real Workbench/Codex scheduler worker path and IntegrationCheck artifacts.
- If not applicable, reason: not applicable.

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
- If applicable, persistent Goal/Change scope checked: `src-alpha-ts-alphareadylabel-strin`.
- If applicable, recommendation authority checked: Goal Loop/controller/preflight evidence explained and prepared bounded continuation only; IntegrationCheck remained a separate manual gate.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: no hidden source apply; bounded continuation stopped before apply/discard.
- If applicable, ToolPolicyGate / human gate preservation checked: `planning.scheduler.integration-check.run` was manually confirmed; final apply/discard remains human-gated.
- If applicable, tested with: targeted Goal Loop surface test and real Workbench acceptance.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: existing owners only.
- If applicable, module owners checked: `src/automation-runtime/runner.ts` and `src/workbench/projections/read-model/confirmation/goal-loop.ts`.
- If applicable, moved responsibilities: not applicable.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: continuation runtime budget finalization and IntegrationCheck manual-gate projection.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: targeted unit tests, typecheck, lint, build.
- If applicable, compatibility result: existing Workbench action and IntegrationCheck artifacts remain compatible.
- If applicable, tested with: targeted unit tests and build.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: reused bounded continuation, controlled scheduler, current-gate revalidation, existing IntegrationCheck, and existing apply/discard gate.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new runtime, scheduler, evidence family, or permission system was added.
- If applicable, public API / facade / Workbench compatibility result: compatible; raw scheduler actions were not added to scoped automation.
- If applicable, future-cost reduction result: IntegrationCheck acceptance now has real evidence without adding another scheduler or automation framework.
- If applicable, tested with: targeted tests plus real acceptance.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: checked before close; current docs now route to the archive handoff and no pending evolution.
- If applicable, latest archive / active path alignment: aligned to `harness/changes/archive/20260625-workbench-scheduler-integrationcheck-real-acceptance-v1/summary.md`.
- If applicable, pending evolution state checked: no pending Harness evolution.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

