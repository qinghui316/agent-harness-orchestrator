# Review: workbench-scoped-automation-audit-acceptance-v1

Status: complete.

## Findings

No blocking findings.

## Verification

- Selected verification scope: automation runtime, current-gate revalidation,
  audit prompt/status semantics, Workbench read-model/user surface, workflow
  action registry, product build, and real browser UI acceptance.
- Targeted checks:
  `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/audit.test.ts`
  passed after the final stop-reason fix.
- Earlier full targeted suite:
  `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/workflow-actions.test.ts`
  produced one aggregate-only App DOM run-graph flake; single
  `npx vitest run tests/unit/web-app.test.tsx` passed.
- Product checks: `npm run typecheck`, `npm run lint`, `npm run test:fast`,
  and `npm run build` passed. `npm run build` was rerun after the final source
  changes before real UI acceptance.
- Workbench aggregate: `npm run test:workbench` timed out at the ordinary tool
  window without assertion failure both before and after the final stop-reason
  fix. Current split Workbench evidence passed:
  `npm run test:workbench:unit`; earlier split evidence passed
  `npm run test:workbench:slow:scheduler`,
  `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`,
  `npx vitest run tests/slow/workbench-maintenance-flow.test.ts`, and
  `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`.
- Rationale: the touched boundary is scoped automation and approval-gate
  handling. The split Workbench evidence plus real UI acceptance is stronger
  than the timed-out aggregate for this product conclusion. The aggregate
  timeout remains known verification topology/runtime-cost debt.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes. The pass used real Workbench browser UI,
  real `coder-codex`, worktree execution, real validation, real audit, and real
  Workbench approval handling. It did not use fake Codex, mocked PATH, fixture
  results, or hand-written run artifacts.
- Manual config edits: none. Workbench trust API wrote the E-drive source path
  into Codex config.
- Extra prompts or reviewer instructions: none.
- Retries/environment notes: `E:\aho-accept\audit-accept-v1b` correctly stopped
  on `approved-with-notes`; generated C-drive runtime state from a PowerShell
  `$home` variable mistake was deleted at
  `C:\Users\qinghui\projects\audit-accept-v1c`; final acceptance used only
  E-drive sandbox `E:\aho-accept\audit-accept-v1e`.
- Final real UI evidence:
  - URL: `http://127.0.0.1:4333/`.
  - Source: `E:\aho-accept\audit-accept-v1e\src`.
  - Runtime home: `E:\aho-accept\audit-accept-v1e\home`.
  - Demand id/change id: `describeautomationmode-full-access-docs-readme`.
  - UI path: demand creation -> planning draft -> manual plan confirmation ->
    one `完全访问权限` confirmation -> decomposition/readiness -> real
    `coder-codex` code run -> validation -> audit -> automatic `audit.accept`
    -> human `result.apply` gate.
  - UI final primary gate: `应用并本地提交`; no automatic apply occurred.
- Run artifacts:
  - Automation run:
    `automation-run-20260624104512-622bb5a6`, status `stopped`,
    stop reason `terminal-human-gate`, completed steps `5`.
  - Final automation iteration:
    `submittedApprovalActionId = "audit.accept"`, `currentGateKind =
    "approval-action"`, status `completed`.
  - Coder run:
    `run-20260624-184515-describeautomationmode-full-access-docs-readme-07e3a0`,
    `runtime = "coder-codex"`, `executionMode = "worktree"`,
    worktree `wt-20260624-184515-1d54f7`.
  - Audit run:
    `run-20260624-184653-describeautomationmode-full-access-docs-readme-b5b8da`,
    status `approved`, findings `[]`, diff hash
    `620717b0590bb98495f92721029ad8bff25c2c60e7801c5035db27e6793768ca`.
- Product-fixable observations handled in this change: auditor prompt now keeps
  positive evidence out of note findings, and automation stop attribution now
  records `terminal-human-gate` when a successful final `audit.accept` reaches
  the human apply boundary at the step budget.

## Documentation Entropy Coverage

- Applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Before/after line counts: `AGENTS.md` 132 -> 176, `docs/STATUS.md` 76 -> 98,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 251 -> 301.
- Duplicate current-state fields checked: active change, pending evolution,
  latest product archive, latest Harness evolution.
- Roadmap/current-direction stale language checked with grep for active path,
  `currently active`, `Active change is open`, and `C:\aho-accept`.
- Result: current docs no longer point at this change as active. Historical
  C-drive sandbox mentions remain only as previous/archive context; current
  acceptance points to E-drive `audit-accept-v1e`.
- Archive-ledger decision: detailed retry history is archive-only; current docs
  retain only the behavior-changing baseline.

## Experience Lifecycle Coverage

- Applicable: no.
- Reason: this is not a Harness evolution or rule/template change.

## Worktree Diff Artifact Coverage

- Applicable: no.
- Reason: this change does not modify diff collection or worktree diff hashing.
  Real acceptance still exercised worktree diff artifacts through the coder run.

## Read Model Projection Coverage

- Applicable: yes.
- Checked scope: confirmation queue / decision inspector availability for safe
  `audit.accept`, terminal apply suppression from automation, and final apply
  gate visibility.
- Tested with: `tests/unit/workbench-read-model.test.ts`,
  `tests/unit/web-app.test.tsx`, and real browser UI acceptance.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Sampled surface: Workbench main demand conversation and right confirmation
  queue.
- Result: `完全访问权限` appeared for supported execution/approval gates, did not
  appear as automatic apply/close/merge authority, and final UI exposed only the
  human `应用并本地提交` gate.
- Out-of-scope future capability check: no full-auto, parallel executor, merge
  queue, remote landing, or Harness evolution action was exposed as current
  automation.
- Running-state check: automation running state suppressed duplicate usable
  confirmation; final primary gate returned after stop.
- Tested with: DOM/unit suites and real UI acceptance at
  `http://127.0.0.1:4333/`.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked target ids: `changeId`, current gate action/approval id, audit target
  id, run id, artifact, and automation budget.
- Tested action path: `planning.automation.scoped-auto.run` server/action path,
  current-primary approval revalidation, and `audit.accept` child dispatch.
- Duplicate affordance check: automation consumed the authoritative primary
  gate only; evidence actions remained evidence/detail paths.

## Transcript Renderer Source-Boundary Coverage

- Applicable: no.
- Reason: default transcript rendering was not changed.

## Source Apply Safety Coverage

- Applicable: yes.
- Source project: `E:\aho-accept\audit-accept-v1e\src`.
- Runtime home: `E:\aho-accept\audit-accept-v1e\home`.
- Worktree/result ids: worktree `wt-20260624-184515-1d54f7`, coder run
  `run-20260624-184515-describeautomationmode-full-access-docs-readme-07e3a0`,
  audit run `run-20260624-184653-describeautomationmode-full-access-docs-readme-b5b8da`.
- Source-root mutation gate checked: UI stopped at `应用并本地提交`; no source
  mutation occurred before explicit human apply.
- Before/after safety: `git -C E:\aho-accept\audit-accept-v1e\src status
  --short` was empty after automation stopped.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Boundary checked: Codex ran in a worktree with full-access runtime capability,
  but AHO authority came from scoped Workbench action targets, current-primary
  revalidation, audit evidence, and human gates.
- Result: Codex session/runtime state did not become workflow authority; Harness
  artifacts and Workbench gates remained truth.

## Proposal / Runtime Boundary Coverage

- Applicable: no.
- Reason: this change did not introduce new proposal artifacts or workflow truth.

## Goal Loop Boundary Coverage

- Applicable: no.
- Reason: this change did not alter Goal Loop policy or recommendation authority.

## Module Boundary Coverage

- Applicable: yes.
- Module owners checked:
  `src/automation-runtime/`, `src/workbench/actions/handlers/automation.ts`,
  `src/workbench/actions/current-action-revalidation.ts`,
  `src/workbench/actions/approval-execution.ts`, Workbench read-model
  projection owners, and `DecisionPanels`.
- Retained facade responsibilities: server/live action surfaces forward typed
  payloads and do not own automation policy.
- Forbidden write-back locations: no main logic was added to `chat.ts`,
  `manager.ts`, broad read-model implementation, `workbench-server.ts`, or
  `App.tsx`.
- Compatibility result: no route or public action id rename.
- Tested with: runtime, revalidation, read-model, DOM, and workflow action tests.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused/strengthened: scoped automation runtime,
  Workbench confirmation queue primary, current-gate revalidation, approval
  action execution, audit acceptance, validation/audit artifacts, and human
  apply/close gates.
- New mechanism: no parallel permission system, registry, projection system, or
  evidence family was added. The new approval child-gate branch is part of the
  existing automation runtime.
- Future-cost result: future safe approval gates can reuse the same
  current-primary approval revalidation and stop-rule structure.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale grep: active path / active wording / current C-drive acceptance path.
- Result: handoff files point to the archive path and no pending evolution. The
  next work is separate product capability or verification-cost reduction, not
  more closeout for this change.

## Remote Handoff Acceptance Coverage

- Applicable: no.
- Reason: no remote PR/push/merge/provider behavior changed.
