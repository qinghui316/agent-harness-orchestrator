# workbench-mode-aware-local-goal-loop-real-ui-acceptance-v1

## Purpose

Verify the latest mode-aware local Goal Loop through the real Workbench UI.
The previous `workbench-mode-aware-local-goal-loop-v1` closeout proved the
runtime and DOM paths, but real browser acceptance was blocked before
navigation by the local in-app browser connector. The connector is now
available, so this change records real UI acceptance rather than adding a new
runtime layer.

## Scope

In scope:

- E-drive external sandbox acceptance for both `请求批准` and `完全访问权限`.
- Real in-app browser UI evidence for primary gate behavior.
- Source safety evidence for the external managed project before and after
  any local apply.
- Minimal product fix only if the UI reveals a true Workbench blocker.

Out of scope:

- New workflow runtime, permission system, projection framework, or evidence
  family.
- Automatic plan confirmation.
- Raw `planning.scheduler.*`, manual IntegrationCheck, integration
  apply/discard, PR, remote, merge, push, or Harness evolution automation.
- Full parallel executor, slot allocator, or child Change creation.

## Current Status

Completed / ready to close.

## Verification

Completed evidence:

- `git status --short`: AHO repo contained only this active acceptance/handoff
  work plus unrelated untracked `README.md`.
- `npm run build`: passed before launching Workbench.
- Real in-app browser Workbench URL: `http://127.0.0.1:4331/`.
- External source: `E:\aho-accept\mode-aware-loop-real-ui-v1\src`.
- External runtime home: `E:\aho-accept\mode-aware-loop-real-ui-v1\home`.
- External source pre/post state: `git status --short` was clean after setup
  and clean after Case C apply/close.
- No product source code changes were needed in AHO.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: initial server launch used the default
  `AHO_HOME` and reported a project id/path conflict; restart with
  `AHO_HOME=E:\aho-accept\mode-aware-loop-real-ui-v1\home` fixed the
  environment. This was a setup issue, not a product blocker.
- Real UI Case A (`请求批准`): demand
  `case-a-src-calculator-js-multiply-a-b` generated a Codex planning draft,
  then human-confirmed plan in request-approval mode. UI showed no auto
  execution and stopped at the real `planning.decompose` primary gate.
- Real UI Case B (`完全访问权限`, scheduler boundary): demand
  `case-b-src-calculator-js-divide-a-b-scripts-che` selected full-access after
  human plan confirmation. Automation run
  `automation-run-20260626081447-3c302511` completed three allowed steps
  (`planning.decompose`, `planning.decomposition.confirm`,
  `planning.decomposition.assess-readiness`) and stopped before raw
  `planning.scheduler.plan.prepare`. This confirms full-access did not
  directly consume raw scheduler gates.
- Real UI Case C (`完全访问权限`, sequential local loop): demand
  `case-c-readme-md-usage-npm-test-checks-p` selected full-access after human
  plan confirmation. Automation run
  `automation-run-20260626082236-b5986927` completed 7 steps and stopped with
  `no-primary-gate`: "Local close completed; no further local automation gate
  remains." UI showed the change as archived with no current primary gate.
- Case C Codex run:
  `run-20260626-162237-case-c-readme-md-usage-npm-test-checks-p-e3c340`
  (`runtime = coder-codex`, `executionMode = worktree`, worktree
  `wt-20260626-162237-9d8cd3`).
- Case C validation:
  `run-20260626-162417-case-c-readme-md-usage-npm-test-checks-p-a782ed`
  passed.
- Case C audit:
  `run-20260626-162419-case-c-readme-md-usage-npm-test-checks-p-9abc8f`
  approved with 0 findings.
- Case C apply:
  `run-20260626-162451-case-c-readme-md-usage-npm-test-checks-p-c1d697`;
  apply committed source root change as
  `ed34439a7cd8dcee2228afb9432d3aaa087ba7f4`.
- Case C archive path:
  `E:\aho-accept\mode-aware-loop-real-ui-v1\home\projects\src\harness\changes\archive\20260626-case-c-readme-md-usage-npm-test-checks-p`.
- Remote handoff acceptance: not applicable; PR/remote/merge are out of scope.
- Product-fixable workarounds or follow-up evidence: Case C archive
  `summary.md` retained template `TBD` text even though UI/source
  apply/validation/audit/close completed. This did not block the requested
  local loop acceptance, but it is a residual closeout-quality issue to
  consider separately if archive summary completeness should become a hard
  close gate.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: closeout only; no broad current-doc rewrite
  planned.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: completed with `rg` over
  `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and the
  active change. Active pointers were aligned before close.
- Old experience retained / merged / retired / archive-only: detailed run ids,
  screenshots, E-drive paths, and gate sequences remain archive-only.
