# Review: workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1

Status: approved for close.

## Findings

No correctness blocker found for the requested acceptance scope.

Residual risk:

- The external Case C archive summary retained template `TBD` text after
  automated close. The UI/source/apply/audit/close path completed, so this is
  not a blocker for mode-aware local loop acceptance, but it is a future
  closeout-quality hardening candidate if archive summary completeness should
  become blocking rather than warning-only.

## Verification

Completed.

- Selected verification scope: no-code real UI acceptance plus `npm run build`
  and Harness closeout checks.
- Full / aggregate suites run or skipped: product suites were skipped because
  no AHO product source changed; the acceptance target was the real browser
  path against a built Workbench.
- Rationale for selected scope: the previous archived implementation already
  covered unit/DOM paths; this change exists specifically to fill the missing
  in-app browser acceptance gap.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing Workbench serve path, confirmation queue, local Goal Loop coordinator, scoped automation, current-gate revalidation, Codex runtime, validation/audit/apply/close owners.
- yagni: avoided: new workflow runtime, permission system, projection framework, evidence family, fake full-auto surface, PR/remote path.
- shrink: acceptance/no-code close is the preferred outcome if real UI passes; product code changes only if a blocker is proven.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes, for external sandbox only.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: first Workbench server launch used the wrong
  `AHO_HOME` and hit a project marker id/path conflict. Relaunching with
  `AHO_HOME=E:\aho-accept\mode-aware-loop-real-ui-v1\home` fixed setup.
- Screenshots / artifacts / run ids:
  - Workbench URL: `http://127.0.0.1:4331/`.
  - Case A: `case-a-src-calculator-js-multiply-a-b`; request-approval stopped
    at `planning.decompose`.
  - Case B: `case-b-src-calculator-js-divide-a-b-scripts-che`;
    `automation-run-20260626081447-3c302511`, stop reason `blocked`, after
    three allowed decomposition/readiness steps and before raw
    `planning.scheduler.plan.prepare`.
  - Case C: `case-c-readme-md-usage-npm-test-checks-p`;
    `automation-run-20260626082236-b5986927`, stop reason `no-primary-gate`;
    archive path `harness/changes/archive/20260626-case-c-readme-md-usage-npm-test-checks-p`.
  - Case C Codex: `run-20260626-162237-case-c-readme-md-usage-npm-test-checks-p-e3c340`.
  - Case C validation: `run-20260626-162417-case-c-readme-md-usage-npm-test-checks-p-a782ed`.
  - Case C audit: `run-20260626-162419-case-c-readme-md-usage-npm-test-checks-p-9abc8f`.
  - Case C apply: `run-20260626-162451-case-c-readme-md-usage-npm-test-checks-p-c1d697`.
- External source/state safety: source
  `E:\aho-accept\mode-aware-loop-real-ui-v1\src`; runtime home
  `E:\aho-accept\mode-aware-loop-real-ui-v1\home`; source `git status
  --short` was clean before and after Case C apply/close. Apply committed
  `ed34439a7cd8dcee2228afb9432d3aaa087ba7f4`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: archive summary
  completeness remains a follow-up quality decision, not part of this runtime
  acceptance.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: yes.
- If applicable, roadmap/current-direction stale language checked: yes.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `lint-ecl`, `lint-encoding`,
  `harness-change reindex/status`, `harness-evolve check`, and handoff grep.
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
- If applicable, checked scope: real browser selected Change primary gate for
  request-approval, full-access scheduler boundary, and full-access sequential
  local close.
- If applicable, tested with: in-app browser at `http://127.0.0.1:4331/`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: real in-app browser Workbench UI.
- If applicable, visible primary UI backed by implemented workflow paths: yes.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: yes; selected Case C ended with no current primary and "暂无需要确认".
- If applicable, stale-history override and running/archived selected-demand suppression checked: archived Case C was read-only and did not keep an old primary gate.
- If applicable, out-of-scope future capability check: no PR/remote/merge/raw scheduler/Harness evolution auto execution observed.
- If applicable, forbidden visible internal terms/actions checked: user-facing primary cards did not expose fake full-auto, PR, merge, or raw scheduler execution as auto-consumable actions.
- If applicable, duplicate primary action / in-flight suppression check: running states hid duplicate primary execution and showed active run status.
- If applicable, high-impact action path result: local result apply and change close were consumed only inside the scoped full-access authorization; raw scheduler and PR/remote remained excluded.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: passed for Case A and Case C; Case B recorded expected raw scheduler boundary stop.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: prior DOM/unit evidence exists in archived `workbench-mode-aware-local-goal-loop-v1`; this change must add real browser evidence.
- If applicable, tested with: real in-app browser.
- If not applicable, reason: not applicable.

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

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: `E:\aho-accept\mode-aware-loop-real-ui-v1\src`.
- If applicable, checked runtime home / external managed-project isolation: `E:\aho-accept\mode-aware-loop-real-ui-v1\home`.
- If applicable, checked worktree ids / result ids / integration check ids: Case C worktree `wt-20260626-162237-9d8cd3`; apply run `run-20260626-162451-case-c-readme-md-usage-npm-test-checks-p-c1d697`; no IntegrationCheck path in Case C.
- If applicable, source-root mutation gate checked: yes; apply committed source root change as `ed34439a7cd8dcee2228afb9432d3aaa087ba7f4`.
- If applicable, out-of-scope source mutation check: no PR/remote/merge/Harness evolution mutation; AHO development repo source was not used as managed project.
- If applicable, tested with: external source `git status --short` and apply artifact.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: Workbench direct external-local project,
  Codex runtime artifacts, and AHO memory home separation.
- If applicable, tested with: real UI plus artifacts under
  `E:\aho-accept\mode-aware-loop-real-ui-v1\home`.
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
- If applicable, persistent Goal/Change scope checked: yes; all automation
  runs were scoped to the selected Change.
- If applicable, recommendation authority checked: yes; loop delegated only
  allowed local gates and stopped before raw scheduler.
- If applicable, fallback priority checked: yes for request-approval and
  full-access sequential local close; Case B raw scheduler remained a human
  gate/background boundary.
- If applicable, packet / main-Agent context freshness checked: not applicable unless scheduler controlled continuation appears.
- If applicable, stale or superseded packet suppression checked: not applicable unless scheduler controlled continuation appears.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: no hidden source
  root mutation before local apply; external source clean after close.
- If applicable, ToolPolicyGate / human gate preservation checked: plan
  confirmation remained human; raw scheduler/manual IntegrationCheck/remote
  gates were not auto-consumed.
- If applicable, tested with: real UI and automation artifacts.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes if product code changes; acceptance-only path records no-code reuse.
- Future feature owner module: existing owners only.
- If applicable, module owners checked: not applicable; no product code blocker
  was fixed.
- If applicable, moved responsibilities: none planned.
- If applicable, retained facade responsibilities: not applicable; no product
  code changed.
- If applicable, forbidden write-back locations: broad facades and new local frameworks.
- If applicable, compatibility surface: Workbench UI/API/action payloads.
- If applicable, behavior path tested: real UI acceptance.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: not applicable; no product code
  changed.
- If applicable, compatibility result: no product code changes.
- If applicable, tested with: not applicable; real UI acceptance only.
- If not applicable, reason: no-code acceptance path.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: Workbench confirmation queue, local Goal Loop coordinator, scoped automation, current-gate revalidation, Codex runtime, validation/audit, source safety, apply/landing/close.
- If applicable, new cross-cutting mechanism and owner: none planned.
- If applicable, why existing mechanisms were insufficient: not applicable unless real UI proves a blocker.
- If applicable, domain-specific logic location: existing touched owner only if needed.
- If applicable, shared cross-cutting logic location: existing action revalidation or projection owner if needed.
- If applicable, local framework / state machine / projection / validation / gate avoided: yes.
- If applicable, public API / facade / Workbench compatibility result: no
  product code changes.
- If applicable, future-cost reduction result: local loop baseline now has
  real browser evidence for request-approval and full-access sequential local
  close; scheduler raw gate remains intentionally manual/controlled.
- If applicable, tested with: real UI acceptance.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: active pointers aligned before
  close; archive pointer will be regenerated by closeout update.
- If applicable, latest archive / active path alignment: active path aligned
  before close.
- If applicable, pending evolution state checked: `harness-evolve check`
  reported no pending evolution and 1 archived change since last completion.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.

