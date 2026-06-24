# Review: workbench-scoped-automation-bounded-rework-acceptance-v1

Status: completed.

## Findings

No blocking product findings remain for this change.

The first E-drive acceptance sample (`E:\aho-accept\bounded-rework-v1`) exposed
an acceptance-scenario scope conflict: validation required a README marker that
the accepted demand did not authorize. Scoped automation correctly consumed
current recovery gates, but audit correctly blocked both the README-marker diff
and the later validation-script-weakened diff. This is not an AHO permission
failure and was not forced through.

## Verification

- Selected verification scope: scoped automation runtime, current-gate
  revalidation, Workbench projection/DOM, package-script verification topology,
  and real browser UI acceptance in E-drive external sandboxes.
- Targeted suite passed:
  `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`.
- Required checks passed before closeout:
  `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`.
- Workbench verification: earlier aggregate `npm run test:workbench` timed out
  after about 424s without assertion failure. The daily Workbench gate was
  converged to a single unit-capability invocation and then passed in 27.3s.
  Full slow/deep Workbench coverage remains explicit release coverage.
- Default `npm run test` passed in 159.1s after the package-script convergence.

## Acceptance Feedback

- Real/manual acceptance performed: yes, through real browser Workbench UI.
- Real Codex acceptance claimed: yes for the positive E-drive sandbox.
- Fake Codex / mocked PATH / fixture result / hand-written artifact exclusion:
  `code.run` produced real `coder-codex` worktree run
  `run-20260624-222150-describeautomationmode-bounded-rework-docs-readm-290bb5`
  with `executionMode = "worktree"` and real diff artifacts.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: first sandbox was stopped because accepted
  scope and validation requirements conflicted. Fresh sandbox used an explicit
  demand that included the marker.
- Positive sandbox:
  `E:\aho-accept\bounded-rework-v1-success\src`,
  runtime home `E:\aho-accept\bounded-rework-v1-success\home`.
- Change id: `describeautomationmode-bounded-rework-docs-readm`.
- Automation evidence:
  authorization `automation-authorization-20260624142146-5854b788`,
  run `automation-run-20260624142146-ec0e240e`,
  `stopReason = "terminal-human-gate"`.
- Automation consumed current gates:
  `planning.decompose`, `planning.decomposition.confirm`,
  `planning.decomposition.assess-readiness`, `code.run`, and safe
  `audit.accept`.
- Validation:
  `run-20260624-222319-describeautomationmode-bounded-rework-docs-readm-39d043`,
  status `passed`, worktree `wt-20260624-222150-de8f2b`.
- Audit:
  `run-20260624-222323-describeautomationmode-bounded-rework-docs-readm-fc19a6`,
  status `approved`, same diff hash
  `e5c17978996033a7bc1054854b41c2db95c1675dddce5320b3d6461e140a15cf`.
- Workbench result: current authoritative primary gate is `result.apply`
  (`single-result-apply`, `确认应用并本地提交`). Automation did not apply.
- Remote handoff acceptance: not applicable.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes, close/handoff docs are
  updated.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, and this active change.
- Current-state duplication decision: keep only current baseline and latest
  archive pointer in entry/handoff docs; detailed E-drive run ids and negative
  sandbox behavior remain in this archived summary/review.
- Roadmap/current-direction stale language checked: latest product baseline now
  includes bounded recovery gate acceptance and daily Workbench fast gate.
- Tested with: `lint-ecl`, `lint-encoding`, `harness-change reindex/status`,
  and `harness-evolve check` before close.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: this is not a Harness evolution or rule/template
  proposal. The first sandbox's scope-conflict lesson is archive-only evidence
  unless repeated in future phases.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: this change does not alter worktree diff
  collection. Positive acceptance still produced a two-file worktree diff and
  matching validation/audit diff hash.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: recovery gates expose `完全访问权限` only when current primary is
  an allowed local automation gate, and final approved result exposes
  `result.apply` as the primary human gate.
- Tested with:
  `tests/unit/workbench-read-model.test.ts`,
  `tests/unit/web-app.test.tsx`, and real UI snapshot after automation.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: right confirmation queue / decision inspector and main
  Workbench conversation.
- Visible primary UI backed by implemented workflow paths: yes; recovery gates
  used existing `result.refresh-rework`, `result.revalidate`, and
  `result.reaudit` workflow actions, and final gate used existing
  `result.apply`.
- Primary-surface alignment: positive snapshot ended with `confirmationQueue`
  and `decisionInspector` both showing `确认应用并本地提交`.
- Running suppression: real UI hid repeat primary gates while automation ran.
- Out-of-scope future capability check: UI did not advertise full-auto,
  parallel executor, merge queue, automatic apply/close, or Harness evolution.
- User-facing internal term check: primary flow used ordinary action labels.
- Tested with: `tests/unit/web-app.test.tsx` plus real browser UI acceptance.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: `changeId`, `worktreeId`, current gate action type, and
  audit run id for safe `audit.accept`.
- Tested action path: automation child executor re-read current
  `confirmationQueue.primary` for each child step and current-gate revalidation
  rejected stale/cross-change targets in `tests/unit/action-revalidation.test.ts`.
- Duplicate action/evidence affordance check: running automation suppressed
  duplicate primary confirmation in DOM and real UI.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If not applicable, reason: this change does not alter transcript rendering.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- Checked source project: `E:\aho-accept\bounded-rework-v1-success\src`.
- Checked runtime home: `E:\aho-accept\bounded-rework-v1-success\home`.
- Worktree id: `wt-20260624-222150-de8f2b`.
- Source-root mutation gate checked: after automation, source root
  `git status --short` was empty and Workbench stopped at human
  `result.apply`.
- Out-of-scope source mutation check: no automatic apply, close, merge, remote,
  or Harness evolution occurred.
- Tested with: real Workbench UI acceptance and source-root git status.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: `完全访问权限` allowed Codex full-access runtime capability,
  but AHO execution authority stayed scoped to the selected Change, current
  primary gate, target ids, ToolPolicy/human-gate evidence, validation/audit,
  and source apply safety.
- Tested with: real `coder-codex` worktree run, validation/audit artifacts, and
  automation run/iteration artifacts.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: planning/decomposition/readiness
  artifacts remained proposals/guardrails until consumed by existing scoped
  actions. Automation iterations are execution audit records, not workflow
  truth.
- Out-of-scope execution paths checked: no automatic planning generation,
  source apply, close/archive, remote, merge, push, or Harness evolution.
- Tested with: automation runtime tests and real UI acceptance.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If not applicable, reason: this change uses scoped automation over the
  authoritative Workbench confirmation queue, not GoalLoopDecision authority or
  controlled scheduler continuation.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Module owners checked: `src/automation-runtime/`, current-gate revalidation,
  Workbench read-model/DOM owners, and existing result action handlers.
- New main logic did not accumulate in broad facades.
- Compatibility surface: existing action types and payload shape remain stable.
- Tested with: runtime, revalidation, read-model, DOM, typecheck, lint, build.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused: scoped automation authorization/run/iteration
  artifacts, current-gate revalidation, confirmation queue, existing workflow
  handlers, validation/audit evidence, ToolPolicyGate, and human apply gate.
- New cross-cutting mechanism: none.
- Local framework avoided: no second runtime, permission system, action
  registry, projection framework, or bounded-rework state machine.
- Future-cost result: later allowed gate families can reuse the same current
  primary gate and target revalidation path.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Latest archive / active path alignment: close should archive this change at
  `harness/changes/archive/20260624-workbench-scoped-automation-bounded-rework-acceptance-v1/`.
- Pending evolution state checked: none expected.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: no Draft PR, PR feedback, remote provider, or
  remote landing behavior changed.
