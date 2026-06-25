# Review: workbench-scheduler-integration-apply-discard-real-acceptance-v1

Status: complete.

## Findings

- No product-blocking findings in the scoped code change. `discardIntegrationCheck` now rejects terminal/non-discardable checks at the handler boundary instead of relying on UI suppression.
- Real browser acceptance did not prove the final IntegrationCheck apply/discard click. Fresh E-drive UI usage routed to a direct single-change path and then blocked on an AC conflict; reopening the prior passed IntegrationCheck sandbox did not restore the old conversation/gate projection in Workbench. This is recorded as follow-up evidence, not a pass claim.

## Verification

- Selected verification scope: integration-check apply/discard handler, Workbench read-model, DOM automation exclusion, and full fast/Workbench aggregate gates.
- Full / aggregate suites run or skipped: `npm run test:workbench` ran and passed. Slow/release scheduler suites were not rerun because the touched behavior is the final apply/discard handler and projection boundary, not worker scheduling.
- Rationale for selected scope: targeted suites prove stale/terminal discard fail-closed behavior and human-gated apply/discard projection; `test:workbench` covers the current Workbench aggregate contract.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Acceptance Feedback

- Real/manual acceptance performed: attempted.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures:
  - `E:\aho-accept\scheduler-apply-discard-v1` fresh UI run did not reach IntegrationCheck because readiness chose direct single-change execution. The run then blocked on a semantic AC conflict: test coverage was required while test edits were forbidden.
  - `E:\aho-accept\scheduler-integrationcheck-v1g` contains a passed IntegrationCheck, but reopening the sandbox in Workbench did not restore the prior conversation/gate surface; the browser showed Harness-uninitialized / memory `unknown`.
- Screenshots / artifacts / run ids:
  - Fresh run ids: `run-20260625-102745-src-alpha-ts-alphaready-string-alpha-ready-sr-4cb834`, `run-20260625-103010-src-alpha-ts-alphaready-string-alpha-ready-sr-34991e`, `run-20260625-103014-src-alpha-ts-alphaready-string-alpha-ready-sr-8980eb`, `run-20260625-103034-src-alpha-ts-alphaready-string-alpha-ready-sr-7488e4`.
  - Passed IntegrationCheck artifact inspected: `E:\aho-accept\scheduler-integrationcheck-v1g\home\projects\scheduler-integrationcheck-v1g\workbench\integration-checks\apply-check-20260624205104-80da3aab\integration-check.json`.
- External source/state safety: `E:\aho-accept\scheduler-apply-discard-v1\src` and `E:\aho-accept\scheduler-integrationcheck-v1g\src` were external E-drive managed sources; `git status --short --untracked-files=all` was clean during source safety checks; no automatic source apply occurred.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: Workbench external-local sandbox restore should be investigated separately so historical IntegrationCheck gates can be reopened from `AHO_HOME` + source marker.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: kept compact; no archive ledger expansion.
- If applicable, duplicate current-state fields checked: yes.
- If applicable, roadmap/current-direction stale language checked: yes.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: detailed E-drive run history remains archive-only; current docs keep only the latest baseline and next-step blocker.
- If applicable, over-budget documents and rationale: none.
- If applicable, tested with: Harness lint/reindex/status during closeout.
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

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: integration apply/discard confirmation queue and DecisionPanels DOM.
- Visible primary UI backed by implemented workflow paths: verified by read-model and DOM tests.
- Authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: verified by Workbench read-model projection test.
- Stale-history override and running/archived selected-demand suppression checked: not changed in this slice.
- Out-of-scope future capability check: DOM test confirms `完全访问权限` is not offered for integration apply/discard.
- Forbidden visible internal terms/actions checked: no fake full-auto, parallel executor, or merge queue surface introduced.
- Duplicate primary action / in-flight suppression check: not changed in this slice.
- High-impact action path result: apply/discard remain confirmation-required human gates.
- Real App DOM / browser UI verification result when the behavior is product-visible: attempted but blocked before the relevant gate; not claimed as pass.
- Projection/unit evidence that supplements but does not replace visible-surface acceptance: `tests/unit/workbench-read-model.test.ts`, `tests/unit/web-app.test.tsx`.
- Tested with: targeted Vitest suite and `npm run test:workbench`.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: `apply-check.apply` includes check id + artifact hash; `apply-check.discard` includes check id.
- Tested action path: projection/DOM payload tests plus integration-check handler unit tests.
- Duplicate action/evidence affordance and in-flight duplicate submission check: no new duplicate action surface added.

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
- Checked source project / fixture: targeted seeded scheduler IntegrationCheck fixture; E-drive external projects inspected as acceptance evidence.
- Checked runtime home / external managed-project isolation: `E:\aho-accept\...` only; no C-drive sandbox and no AHO development repo as managed source.
- Checked worktree ids / result ids / integration check ids: `apply-check-20260624205104-80da3aab` inspected; seeded IntegrationCheck ids tested.
- Source-root mutation gate checked: discard leaves source clean; apply remains guarded by existing clean source, HEAD, hash, validation, and audit checks.
- Out-of-scope source mutation check: `完全访问权限` did not auto-apply during the fresh UI run.
- Tested with: `tests/unit/integration-check-apply-discard.test.ts`, `npm run test:workbench`.

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
- Future feature owner module: `src/integration-check/` owns apply/discard safety; Workbench approval execution remains a thin dispatcher.
- Module owners checked: yes.
- Moved responsibilities: none planned.
- Retained facade responsibilities: `src/workbench/actions/approval-execution.ts` remains a thin dispatcher.
- Forbidden write-back locations: no new workflow runtime, registry, or broad Workbench facade logic.
- Compatibility surface: no external CLI/API contract changes; stricter handler rejection only.
- Behavior path tested: discard handler, Workbench projection, DOM surface, aggregate Workbench tests.
- Follow-up split candidates: none planned.
- Boundary tests or lint checks: module boundary coverage remained unchanged; targeted behavior tests added.
- Compatibility result: compatible except stale/terminal discard now fails closed as intended.
- Tested with: targeted Vitest suite, typecheck, lint, test:fast, build, test:workbench.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: existing IntegrationCheck apply/discard owner, Workbench approval dispatch, confirmation queue, and source safety guards.
- New cross-cutting mechanism and owner: none planned.
- Why existing mechanisms were insufficient: discard handler lacked terminal-status guard.
- Domain-specific logic location: `src/integration-check/`.
- Shared cross-cutting logic location: existing Workbench action payload and confirmation queue paths.
- Local framework / state machine / projection / validation / gate avoided: no new workflow runtime, permission system, or scheduler executor.
- Public API / facade / Workbench compatibility result: unchanged API shape; safer runtime behavior.
- Future-cost reduction result: terminal discard safety now lives in the IntegrationCheck owner, not UI-only projection logic.
- Tested with: targeted Vitest suite, `npm run test:workbench`.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: run during closeout.
- If applicable, latest archive / active path alignment: updated during closeout.
- If applicable, pending evolution state checked: no pending evolution expected.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

