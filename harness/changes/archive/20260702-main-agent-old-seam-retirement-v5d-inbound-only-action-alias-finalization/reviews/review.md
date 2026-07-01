# Review: main-agent-old-seam-retirement-v5d-inbound-only-action-alias-finalization

Status: reviewed.

## Findings

None.

## Verification

- `npx vitest run tests/unit/workflow-actions.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-action-service.test.ts tests/unit/workbench-action-results.test.ts tests/unit/workbench-module-boundaries.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed.
- `npm run build` passed with the existing Vite chunk-size warning.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- Selected verification scope: targeted action/alias/revalidation/service/result/boundary suites plus aggregate fast/type/lint/build checks.
- Full / aggregate suites run or skipped: `test:fast` and build were run; full slow/release Workbench suites were skipped because this change does not alter UI, Scheduler execution, IntegrationCheck execution, source apply, or runtime execution paths.
- Rationale for selected scope: V5d changes action alias helper/export and test boundaries only; targeted suites cover canonical/legacy routing, historical echo, revalidation exclusions, labels/summaries, stop conflict bypass, and module boundaries.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: reused `main-agent-execution` normalizer, workflow registry/live sets, Workbench handler alias map, action service echo behavior, action labels/summaries, and module-boundary tests.
- yagni: avoided a migration runner, new action registry, UI change, new permission model, or data rewrite.
- shrink: direct deletion of legacy aliases was checked and rejected because historical inbound payloads may still exist; permanent inbound-only compatibility is the smaller safe change.
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
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change files.
- If applicable, before/after line counts: not measured; edits are localized handoff/current-direction updates.
- If applicable, duplicate current-state fields checked: latest active path and V5d wording now align across current handoff docs.
- If applicable, roadmap/current-direction stale language checked: V5c "next step" wording was replaced with active V5d wording.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: V5c details remain archive-only; V5d inbound-only decision becomes current handoff.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `lint-ecl`, `harness-change reindex`, `harness-evolve check`, and `harness-change status`.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: retain `role.pipeline.*` as inbound-only compatibility because historical durable payloads may exist.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: keep V5c consumer inventory details in archive rather than expanding current docs.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: targeted suites plus handoff lint.
- If not applicable, reason: not applicable.

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

- Workbench user-surface honesty coverage applicable: yes.
- Product-visible Workbench controls are applicable unless the review records why they cannot affect user decisions; do not mark this section not applicable only because the control does not change the authoritative primary decision surface.
- If applicable, sampled surface: action labels, thread-stream labels, and action result summaries.
- If applicable, visible primary UI backed by implemented workflow paths: canonical and legacy ids route to existing main-agent execution handlers.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: no confirmationQueue behavior changed; tests keep `MainAgentLoopProjection` out of UI.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: not applicable.
- If applicable, forbidden visible internal terms/actions checked: `role.pipeline.*` labels continue to normalize to main-agent execution language.
- If applicable, duplicate primary action / in-flight suppression check: not applicable.
- If applicable, high-impact action path result: not applicable.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: not applicable.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: not applicable.
- If applicable, tested with: `workbench-action-results`, `workbench-module-boundaries`, `workflow-actions`.
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

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: target ids are unchanged; this change checks action type alias semantics rather than target shape.
- If applicable, tested action path: canonical and legacy main-agent execution action service paths.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: canonical and legacy stop both bypass active-action conflict only as control actions.
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
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: no Goal Loop generated payload or recommendation path emits legacy ids; no execution behavior changed.
- If applicable, ToolPolicyGate / human gate preservation checked: legacy aliases remain outside automation/high-impact/revalidated expansion.
- If applicable, tested with: `workflow-actions`, `action-revalidation`, `workbench-module-boundaries`.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/workflow-actions/main-agent-execution.ts`.
- If applicable, module owners checked: workflow action registry, Workbench action service/results/handlers, web labels, thread stream.
- If applicable, moved responsibilities: none.
- If applicable, retained facade responsibilities: registry/live sets and handler alias map retain legacy inbound compatibility.
- If applicable, forbidden write-back locations: Scheduler, IntegrationCheck, confirmationQueue, automation allowlist, apply/close, remote/PR/merge.
- If applicable, compatibility surface: `role.pipeline.*` inbound registry/live/handler aliases plus historical echo evidence.
- If applicable, behavior path tested: canonical and legacy action service paths, stop conflict bypass, labels/summaries.
- If applicable, follow-up split candidates: `MainAgentLoopProjection` retirement.
- If applicable, boundary tests or lint checks: `workbench-module-boundaries`, `workflow-actions`, `action-revalidation`.
- If applicable, compatibility result: legacy inbound remains executable; new outbound remains canonical.
- If applicable, tested with: targeted suites and `test:fast`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing normalizer, registry, handler map, service echo, labels, summaries, and boundary tests.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: not applicable.
- If applicable, shared cross-cutting logic location: not applicable.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new framework or gate.
- If applicable, public API / facade / Workbench compatibility result: canonical public ids remain; legacy ids are inbound-only compatibility.
- If applicable, future-cost reduction result: old seam no longer ambiguous for future agents.
- If applicable, tested with: targeted suites and `test:fast`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: checked after close; handoff docs no longer point to active V5d.
- If applicable, latest archive / active path alignment: V5d archive path is the latest product change after close.
- If applicable, pending evolution state checked: no pending evolution before implementation; pending evolution was generated after V5d close and is now named in handoff docs.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

