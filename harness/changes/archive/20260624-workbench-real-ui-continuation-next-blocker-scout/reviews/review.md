# Review: workbench-real-ui-continuation-next-blocker-scout

Status: approved.

## Findings

No blocking findings remain.

Resolved findings:

- Product path bug: repo-local `.agent-harness/workbench/` runtime files were
  not ignored and could pollute source status. Fixed in `src/harness/init.ts`
  with unit and CLI coverage.
- Product path bug: Workbench intake and worktree dependency checks bypassed
  BOM-safe JSON parsing for `package.json`. Fixed in `src/workbench/intake.ts`
  and `src/worktree/dependencies.ts` with targeted tests.

Non-blocking acceptance notes:

- The `C:\aho-accept\continue-next-valid` repo-local rerun correctly stopped
  before apply because active Change files in source made the project dirty.
  This is negative source-safety evidence and confirms external-local memory is
  the right acceptance shape for source/apply paths.
- The final sandbox validation config used `validation.commands` instead of the
  current `validation.profiles.default` schema, so official validation used the
  package fallback. The product path still passed validation; `npm run
  test:fast` was run separately in the sandbox and passed.

## Verification

- Selected verification scope: real browser Workbench scout plus targeted
  boundary suites and aggregate Workbench verification because product code
  touched Harness init, Workbench intake, worktree dependency setup, and
  Workbench read-model tests.
- Targeted suites:
  `npx vitest run tests/unit/harness.test.ts tests/integration/cli-flow.test.ts tests/unit/workbench-read-model.test.ts tests/unit/worktree.test.ts`
  passed, 4 files / 83 tests.
- Required project checks passed:
  `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`,
  and `npm run test:workbench`.
- Aggregate result: `npm run test:workbench` passed, including Workbench unit
  suites and slow scheduler / demand / remote landing / maintenance suites.
- Aggregate runtime note: `npm run test:workbench` completed in about 9m40s.
  This is still expensive, but it completed without assertion failure or timeout.

## Acceptance Feedback

- Real/manual acceptance performed: yes, through real in-app browser UI.
- Final source: `C:\aho-accept\continue-next-external\src`.
- Final runtime home:
  `C:\aho-accept\continue-next-external\home`.
- Workbench URL: `http://127.0.0.1:4335/`.
- Demand/change id: `readme-md-usage-sandbox-aho-workbench`.
- Visible gate sequence:
  `生成方案草案 -> 确认规划 -> 生成拆分提案 -> 确认拆分方向 -> 检查执行边界 -> 运行 Code -> 确认审查证据 -> 应用并本地提交 -> 确认完成需求`.
- Real Codex acceptance claimed: yes for `code.run`.
- Fake Codex / mocked PATH / fixture result / hand-written artifact exclusion:
  coder evidence came from
  `run-20260624-122101-readme-md-usage-sandbox-aho-workbench-7628f1` with
  `runtime = "coder-codex"`, `executionMode = "worktree"`, command invoking
  real `codex exec`, and recorded `codex-events.jsonl`, `last-message.md`,
  `diff.patch`, `diff-stat.txt`, and `implementation.md`.
- Validation:
  `run-20260624-122326-readme-md-usage-sandbox-aho-workbench-f03b82`,
  status `passed`, diff hash
  `ca3d05141eeb7ef58e03e0ed11df7ef76fb9a4030879e6032a7b1bc4d95dfdea`.
- Audit:
  `run-20260624-122328-readme-md-usage-sandbox-aho-workbench-d16153`,
  status `approved`, findings `[]`.
- Apply:
  `run-20260624-122602-readme-md-usage-sandbox-aho-workbench-36a685`,
  status `applied`, commit
  `c690c419218e0095ab0c0b520040594346c9de6f`.
- Close/archive:
  `C:\aho-accept\continue-next-external\home\projects\continue-next-external\harness\changes\archive\20260624-readme-md-usage-sandbox-aho-workbench\`.
- Manual config edits: sandbox setup created an external-local memory project and
  a validation profile file; the final official validation used package fallback
  because the sandbox profile shape was not `validation.profiles.default`.
- Retries or environment failures: one repo-local attempt stopped at
  source-safety; one BOM package read bug was fixed before the final run.
- Remote handoff acceptance: not applicable.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Line counts during closeout: `AGENTS.md` 214, `docs/STATUS.md` 210,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 271.
- Duplicate current-state fields checked: active change path agrees across
  handoff docs before close.
- Roadmap/current-direction stale language checked: current direction points to
  this active scout before archive closeout and will be updated after archive.
- Archive-ledger content promoted / retained / merged / retired / archive-only:
  retained only current source/memory separation and bounded continuation
  baseline; detailed attempt history stays archive-only in this change summary.
- Over-budget documents and rationale: `AGENTS.md` and `docs/STATUS.md` are over
  the target budget because they retain current active handoff and recent
  product-baseline routing; no extra phase ledger was added in this review.
- Tested with: drift grep over active path and current handoff docs.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: no Harness evolution proposal is needed; existing
  external-local memory rules already cover the source/memory separation lesson.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: the product fixes did not touch worktree diff
  collection. Real Codex acceptance produced a tracked README modification only.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: real browser right confirmation queue and Workbench read-model
  tests.
- Tested with: `tests/unit/workbench-read-model.test.ts`, full
  `npm run test:workbench`, and real UI gate sequence.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: real browser Workbench selected demand at
  `http://127.0.0.1:4335/`.
- Visible primary UI backed by implemented workflow paths: yes. Every clicked
  primary gate corresponded to an implemented Workbench action.
- Authoritative primary-surface alignment checked across confirmation queue /
  decision inspector / visible primary card: yes via the visible queue and
  aggregate Workbench tests.
- Stale-history override and running/archived selected-demand suppression
  checked: yes. Running confirmations disabled duplicate submit; after close the
  selected demand had no current primary confirmation.
- Out-of-scope future capability check: no fake full-auto, parallel executor,
  merge queue, slot allocator, automatic apply, or automatic close control was
  used or exposed as a current action.
- Duplicate primary action / in-flight suppression check: yes; code.run and
  audit/apply confirmations disabled while submitting.
- High-impact action path result: apply and close remained separate human-gated
  UI confirmations.
- Real App DOM / browser UI verification result: passed.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes for real UI
  continuation/action path observation; no action payload contract changed.
- Checked target ids: visible gates stayed scoped to
  `readme-md-usage-sandbox-aho-workbench`; server-side stale target coverage is
  exercised by existing Workbench aggregate tests.
- Tested action path: planning, decomposition/readiness, `code.run`,
  `audit.accept`, `result.apply`, and `change.close`.
- Duplicate action/evidence affordance and in-flight duplicate submission check:
  submit buttons disabled during live action execution; no duplicate primary
  action was exposed.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If not applicable, reason: this change did not modify transcript rendering.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- Checked source project / fixture:
  `C:\aho-accept\continue-next-external\src`.
- Checked runtime home / external managed-project isolation:
  `C:\aho-accept\continue-next-external\home`.
- Checked worktree ids / result ids / integration check ids:
  `wt-20260624-122101-60389b`,
  `run-20260624-122101-readme-md-usage-sandbox-aho-workbench-7628f1`,
  validation `run-20260624-122326-readme-md-usage-sandbox-aho-workbench-f03b82`,
  audit `run-20260624-122328-readme-md-usage-sandbox-aho-workbench-d16153`.
- Source-root mutation gate checked: `git status --short` was clean before code
  execution, clean before apply, and clean after apply/close.
- Out-of-scope source mutation check: Codex wrote only in the AHO-owned worktree
  until the explicit UI `应用并本地提交` gate.
- Tested with: real UI apply path, resulting local commit
  `c690c419218e0095ab0c0b520040594346c9de6f`.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- Checked boundary: external-local memory stored durable AHO artifacts outside
  source; source root remained business checkout; real `coder-codex` run wrote a
  worktree diff and did not become workflow truth until validation/audit/apply.
- Tested with: run artifacts under the external memory root and source git
  before/after checks.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- Artifact type and authority classification: planning bundle and
  decomposition/readiness are proposal/guardrail evidence; `Run`,
  Validation/Audit, Apply, and Close are workflow evidence/gates.
- Boundary matrix checked: the real UI sequence showed planning confirmation did
  not start execution, decomposition confirmation did not start execution, and
  readiness was required before `code.run`.
- Out-of-scope execution paths checked: no full-auto, child Change, scheduler
  loop, automatic apply, or automatic close occurred.
- Stale/forged target behavior checked: covered by existing Workbench aggregate
  stale-target tests.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes.
- Persistent Goal/Change scope checked: selected demand
  `readme-md-usage-sandbox-aho-workbench`.
- Recommendation authority checked: ordinary path did not expose a supported
  controlled Scheduler continuation gate, so none was fabricated.
- Fallback priority checked: concrete planning/readiness/code/apply/close gates
  stayed primary.
- Hidden execution / source mutation check: no Goal Loop evidence executed a
  transition; source mutation waited for explicit apply.
- ToolPolicyGate / human gate preservation checked: code/apply/close remained
  scoped, human-gated actions.
- Tested with: real UI scout and `npm run test:workbench`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Module owners checked:
  - `src/harness/init.ts` owns Harness marker/runtime ignore setup.
  - `src/workbench/intake.ts` owns Workbench package-script intake reads.
  - `src/worktree/dependencies.ts` owns worktree dependency setup checks.
- Forbidden write-back locations: no broad Workbench/server/frontend facade
  gained new main logic.
- Compatibility result: public Workbench/API/action behavior remains compatible;
  JSON parsing is stricter and safer for BOM input.
- Tested with: targeted suites, `npm run test:fast`, and `npm run test:workbench`.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: shared `parseJsonText`, existing
  Harness init ignore owner, existing worktree dependency bridge, Workbench
  action registry, scoped target revalidation, ToolPolicy/human gates,
  validation/audit, result review, apply/close.
- New cross-cutting mechanism and owner: none.
- Local framework / state machine / projection / validation / gate avoided: no
  new evidence family or local parser/validation system.
- Public API / facade / Workbench compatibility result: compatible.
- Future-cost reduction result: real UI acceptance clarified that future source
  apply acceptance should use external-local memory to avoid repo-local Harness
  files becoming source-safety noise.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: checked active path mentions before archive;
  archive closeout must replace active references with the archived summary path.
- Latest archive / active path alignment: active path aligned before close.
- Harness evolution state checked: none.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR
  feedback refresh, provider capability detection, remote checks/reviews, or
  remote handoff evidence.
