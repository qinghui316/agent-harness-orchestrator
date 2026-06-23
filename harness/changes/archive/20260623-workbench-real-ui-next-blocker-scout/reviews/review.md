# Review: workbench-real-ui-next-blocker-scout

Status: complete.

## Findings

No unresolved findings remain.

Resolved findings:

- Product path bug: active foreground validator AgentTasks did not fully drive
  Workbench running state, which allowed result-review decisions to surface
  before validation/audit evidence was terminal. Fixed in read-model projection
  and runtime failure handling.
- UI honesty gap: after close/archive, a selected archived demand could still
  surface landing context as the current primary confirmation. Fixed by
  demoting selected archived-topic items out of the current primary
  confirmation surface.

## Verification

Selected verification scope: real browser UI scout plus touched-boundary
projection/runtime tests and standard product checks.

Commands run:

- `git status --short`
- `npm run build`
- `npx vitest run tests/unit/workbench-read-model.test.ts`
- `npx vitest run tests/slow/workbench-apply-integration-flow.test.ts -t "completes a user-facing manual gated Workbench loop through apply and archive"`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`

Aggregate note: a combined ad hoc Vitest invocation of
`tests/unit/workbench-read-model.test.ts` plus
`tests/slow/workbench-apply-integration-flow.test.ts` exceeded the tool window
without a reported assertion failure. The relevant split members above passed,
and `npm run test:fast` plus targeted slow acceptance cover the touched
projection/runtime/apply-close boundary for this change. The residual aggregate
runtime cost is consistent with the known next track,
`scheduler-slow-runtime-reduction`.

## Acceptance Feedback

- Real/manual acceptance performed: yes, in browser UI at
  `http://127.0.0.1:4331`.
- External source: `C:\aho-accept\next2\src`.
- External runtime home: `C:\aho-accept\next2\home`.
- Workbench demand/change id: `aho-workbench-ci-real-ui-smoke-scout-s`.
- Real Codex run:
  `run-20260623-155700-aho-workbench-ci-real-ui-smoke-scout-s-f03880`,
  `runtime = "coder-codex"`, `executionMode = "worktree"`.
- Fake Codex / mocked PATH / fixture result / hand-written artifact exclusion:
  pass evidence comes from real run artifacts on disk:
  `run.json`, `codex-events.jsonl`, `last-message.md`, `diff.patch`, and
  `diff-stat.txt`.
- Validation:
  `run-20260623-155827-aho-workbench-ci-real-ui-smoke-scout-s-55d387`,
  status `passed`, diff hash
  `e331862a184603170d23560c0684ca81849733fb7e9713e0c3d993321b40794e`.
- Audit:
  `run-20260623-155926-aho-workbench-ci-real-ui-smoke-scout-s-5a801f`,
  status `approved`, same diff hash.
- Apply:
  `run-20260623-160054-aho-workbench-ci-real-ui-smoke-scout-s-c4c24d`,
  status `applied`, local commit
  `4e34b6f782f59ba62c1d858ba3bb5c68f9186406`.
- Close/archive path:
  `C:\aho-accept\next2\home\projects\aho-scout-next2\harness\changes\archive\20260623-aho-workbench-ci-real-ui-smoke-scout-s`.
- Manual config edits: bounded external validation profile in
  `C:\aho-accept\next2\home\projects\aho-scout-next2\harness\config\environment.json`.
- Environment note: first sandbox used the wrong local validation profile shape;
  the fresh `next2` sandbox used the correct array-of-command profile and
  completed.
- Browser UI post-close evidence: selected demand was `已归档`, confirmation
  queue showed `暂无需要确认`, `确认完成需求` was absent, `开始落地检查` was
  absent, and no apply/close/landing primary gate was exposed for the selected
  archived demand.
- Remote handoff acceptance: not applicable; no remote PR, push, merge, or
  provider action was in scope.

## Documentation Entropy Coverage

- Applicable: yes, because active handoff state changes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Pre-close line counts: `AGENTS.md` 176, `docs/STATUS.md` 154,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 242.
- Duplicate current-state fields checked: active change, pending evolution,
  latest archive, current baseline, and next recommended work.
- Roadmap/current-direction stale language checked: active scout path should be
  removed at close and next work should point to scheduler slow runtime
  reduction.
- Historical detail decision: retain the short real-scout result in the archive;
  keep detailed run ids and blocker history archive-only after close.

## Experience Lifecycle Coverage

- Applicable: no.
- Reason: this is not an auto-evolve, Harness rule/template, or stable-memory
  change.

## Worktree Diff Artifact Coverage

- Applicable: no.
- Reason: product fixes do not change worktree diff collection or hashing.

## Read Model Projection Coverage

- Applicable: yes.
- Checked scope: active foreground validator task suppresses result-review
  decisions; selected archived demand no longer exposes landing/close/apply as
  the current primary confirmation.
- Tested with:
  `npx vitest run tests/unit/workbench-read-model.test.ts` and
  targeted slow apply/close acceptance.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Sampled surface: real browser UI Workbench demand, right confirmation panel,
  result review/apply/close gates, and post-close archived demand view.
- Visible primary UI result: each reached high-impact action was a real
  Workbench gate; running validation no longer exposes premature result-review
  decisions; archived selected demand no longer exposes a current primary
  landing gate.
- Out-of-scope future capability check: no full-auto, scheduler loop, parallel
  executor, slot allocator, remote merge, or merge queue action was introduced.
- Tested with real browser UI plus projection/slow acceptance tests.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked target ids: real UI gates carried scoped demand/change/worktree/run
  targets through planning, code, audit, apply, and close.
- Duplicate action/evidence affordance: action-running and active role pipeline
  state suppress repeated primary decisions; archived selected-topic items are
  not primary.
- Tested with real browser UI and read-model tests.

## Transcript Renderer Source-Boundary Coverage

- Applicable: no.
- Reason: change does not alter the default Workbench transcript renderer or
  parent-agent transcript projection.

## Source Apply Safety Coverage

- Applicable: yes.
- Source project: `C:\aho-accept\next2\src`.
- Runtime home: `C:\aho-accept\next2\home`.
- Worktree id: `wt-20260623-155700-5454b2`.
- Source mutation gate: source was clean before apply; mutation occurred only
  after explicit UI `result.apply`; source was clean after apply.
- Commit: `4e34b6f782f59ba62c1d858ba3bb5c68f9186406`.
- Out-of-scope source mutation check: AHO development checkout was not the
  managed project under test; unrelated `README.md` in the development checkout
  remained untouched.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Checked boundary: real Codex worktree execution, external AHO home, validation
  worktree, audit, and apply artifacts remained project/runtime evidence;
  Workbench UI and SQLite/projections did not replace Harness run artifacts,
  validation, audit, apply, or close as workflow truth.
- Tested with real browser UI run artifacts and targeted runtime/projection
  tests.

## Proposal / Runtime Boundary Coverage

- Applicable: no.
- Reason: change does not introduce or change planning/decomposition/readiness
  artifact authority or proposal execution semantics.

## Goal Loop Boundary Coverage

- Applicable: no.
- Reason: change does not add or change Goal Loop policy, packet, feedback, or
  autonomous continuation behavior.

## Module Boundary Coverage

- Applicable: yes.
- Owner modules:
  - `src/workbench/projections/read-model/workpad.ts` owns active role task
    projection into workpad running state and role pipeline.
  - `src/workbench/projections/read-model/confirmation-queue.ts` owns primary
    confirmation derivation and selected archived-topic demotion.
  - `src/workbench/projections/read-model/decision-inspector.ts` owns decision
    inspector suppression while foreground role work is active.
  - `src/workflow-runtime/kernel/role-stage-runner.ts` owns role-stage runtime
    failure completion for validation/audit startup exceptions.
- Compatibility result: no external action id, API shape, or human gate contract
  was changed; server/UI behavior became stricter and more honest.
- Tested with read-model unit coverage and targeted slow Workbench apply/close
  acceptance.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused or strengthened: Workbench read-model projection,
  confirmation queue primary derivation, role pipeline state, runtime
  orchestration completion, validation/audit artifacts, result review, source
  apply safety, and close/archive handoff.
- New cross-cutting mechanism: none.
- Local framework avoided: no new evidence family, summary layer, fake
  automation, scheduler loop, or duplicate confirmation system was added.
- Future-cost result: the product now handles the discovered real UI blockers
  through existing projection/runtime owners, making the next work a verification
  cost reduction track rather than another explanation layer.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: checked after archive close for the old active
  path in `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Latest archive / active path alignment: `harness-change close` moved the
  change to `harness/changes/archive/20260623-workbench-real-ui-next-blocker-scout`;
  handoff docs now state that no active change remains.
- Pending evolution state checked: none.

## Remote Handoff Acceptance Coverage

- Applicable: no.
- Reason: change does not affect Draft PR creation/update, PR feedback refresh,
  provider capability detection, remote checks/reviews, or remote handoff
  evidence.
