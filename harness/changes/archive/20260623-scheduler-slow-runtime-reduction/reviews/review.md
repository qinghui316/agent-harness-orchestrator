# Review: scheduler-slow-runtime-reduction

Status: completed / ready to close.

## Findings

No unresolved implementation findings.

Residual verification debt remains explicit: full `npm run test:workbench`
exceeded the tool window after 1,504s without assertion failure output. Split
Workbench gates and the touched capability-domain suites passed, so this is
recorded as aggregate runtime-cost debt, not a product-health failure.

## Verification

- Passed: `npx vitest run tests/slow/workbench-scheduler-discard-completion-flow.test.ts`.
- Passed: `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`.
- Passed: `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`.
- Passed: `npx vitest run tests/unit/web-app.test.tsx`.
- Passed: `npm run test:workbench:slow:scheduler`.
- Passed: `npm run test:fast`.
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run build`.
- Timed out: `npm run test:workbench` after about 1,504s. No assertion failure
  output was returned. The retained split suites above passed, and the orphaned
  test process tree was identified and stopped.
- Harness checks: recorded in closeout after the final reindex/status pass.

Selected verification scope: scheduler slow split diagnostics, scheduler slow
aggregate, Workbench read-model/App DOM coverage, demand golden-flow coverage,
standard product checks, Workbench aggregate attempt, and Harness checks.

## Baseline Diagnostics

- `workbench-scheduler-two-worker-integration-flow.test.ts`: retained as the
  full end-to-end golden path. Final scheduler aggregate run passed with test
  body about 475.6s and file duration about 489.5s.
- `workbench-scheduler-discard-completion-flow.test.ts`: prior planning
  diagnostic could exceed an ordinary tool window because it replayed the full
  two-worker chain. A pre-seed focused run with fake Codex support still took
  roughly 268s. Final seeded focused/aggregate runs passed with test body about
  10-12s and file duration about 22-23s.
- `workbench-scheduler-worker-rework-flow.test.ts`: final scheduler aggregate
  run passed with test body about 103.0s and file duration about 114.0s.
- `workbench-scheduler-worker-runtime.test.ts`: final scheduler aggregate run
  passed with test body about 72.7s and file duration about 84.0s.
- Leftover process check: no lingering Git process was found. Full
  `test:workbench` timeout left Vitest/tinypool Node children for this repo;
  they were identified by command line and stopped. PM2, MCP, and Bifrost
  processes were not stopped.

## Coverage Mapping

- Two-worker integration domain: still covered by
  `tests/slow/workbench-scheduler-two-worker-integration-flow.test.ts` through
  the real full worker chain, validation/audit, integration candidate,
  IntegrationCheck handoff, and scheduler completion path.
- Discard completion domain: now starts from
  `prepareSeededSchedulerIntegrationHandoff`, which writes canonical scheduler,
  runtime, worktree, IntegrationCheck, and handoff artifacts, then executes the
  real discard/completion/controlled-step/Goal Loop/terminal handoff behavior
  under test.
- Worker rework domain: still covered by
  `tests/slow/workbench-scheduler-worker-rework-flow.test.ts`.
- Worker runtime domain: still covered by
  `tests/slow/workbench-scheduler-worker-runtime.test.ts`.
- Assertions moved or replaced: no scheduler/runtime/source-safety assertion
  was deleted. Repeated upstream setup was replaced only for the discard
  completion scenario; the full two-worker golden path remains.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- Fake Codex / mocked PATH / fixture-result exclusion evidence: not applicable
  to real acceptance. The scheduler terminal handoff path intentionally uses a
  read-only fake Codex in tests to avoid hitting the real external provider and
  to prevent source mutation from prompt-context checks.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: full `npm run test:workbench` exceeded the
  tool window; split suites passed and the leftover test processes were cleaned
  up.
- Product-fixable workarounds or follow-up evidence: aggregate verification
  exposed two concrete signal bugs fixed in this change: readonly/planning runs
  no longer keep `rolePipeline.status` stuck at `running`, and App DOM
  run-graph coverage no longer waits on aggregate-sensitive fetch-spy timing.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change files.
- Before close line counts: `AGENTS.md` 183 lines, `docs/STATUS.md` 168 lines,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 246 lines.
- Duplicate current-state fields checked: `AGENTS.md` and `docs/STATUS.md`
  point to the same active change. Close should replace those pointers with the
  archive path.
- Roadmap/current-direction stale language checked:
  `docs/CURRENT-DEVELOPMENT-PLAN.md` already frames scheduler runtime-cost
  work as verification architecture, not product expansion.
- Archive-ledger content promoted / retained / merged / retired /
  archive-only: detailed timing evidence stays archive-only in this change.
  Current docs should keep only the next actionable handoff.
- Over-budget documents and rationale: `AGENTS.md` is slightly above the
  120-180 target because it carries current routing and handoff details;
  no archive ledger was added.
- Tested with: Harness lint/reindex/status in closeout.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes.
- Promote decisions: promote only the concrete fixture pattern by code/tests:
  later-stage scheduler slow tests may seed canonical intermediate state when
  one full golden path remains.
- Retain decisions: retain Workbench aggregate timeout handling as verification
  topology debt.
- Merge decisions: scheduler slow diagnostics are consolidated in this review
  rather than copied into handoff docs.
- Retire decisions: retire the expectation that discard completion must replay
  the full two-worker chain.
- Archive-only decisions: exact timing history remains in this archived change
  and generated index.
- Tested with: scheduler split/aggregate checks and Harness closeout checks.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- Reason: this change does not alter worktree diff collection or apply-preview
  behavior. Seeded worktree metadata is used only to exercise scheduler discard
  completion and source-safety projection.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- Checked scope: `planning.confirm-execution` remains visible after a completed
  planning draft even when readonly/intake/planning support runs exist; the
  confirmation queue and Workpad next action stay aligned.
- Tested with:
  `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`
  and
  `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`.

## Workbench User-Surface Honesty Coverage

- Applicable: yes, because a read-model running-state fix affects primary
  confirmation visibility.
- Sampled surface: Workbench confirmation queue and App DOM run graph tab.
- Visible primary UI backed by implemented workflow paths: golden-flow confirms
  `planning.confirm-execution` appears only as a real scoped workflow action.
- Out-of-scope future capability check: existing DOM coverage continues to
  reject fake automation affordances.
- Duplicate primary action / in-flight suppression check: existing read-model
  tests still cover active workflow/run suppression; readonly planning support
  no longer suppresses a real next gate.
- Tested with: workbench read-model, web-app, demand golden-flow, and
  `test:fast`.

## Scoped Workbench Action Payload Coverage

- Applicable: yes for the `planning.confirm-execution` projection fix.
- Checked target ids: `changeId` and `planningBundleId` are carried from the
  authoritative Workpad next action when the planning artifact bundle summary
  is not otherwise present.
- Tested action path: demand golden-flow confirms the planning confirmation
  payload is present and accepted before decomposition/readiness/code run.
- Duplicate action/evidence affordance check: confirmation queue exposes one
  primary planning gate.

## Transcript Renderer Source-Boundary Coverage

- Applicable: no.
- Reason: this change does not alter transcript cell rendering or assistant
  markdown source selection.

## Source Apply Safety Coverage

- Applicable: yes for scheduler discard/completion source mutation boundaries.
- Checked source project / fixture: temp project created by Workbench scheduler
  fixtures.
- Runtime home / isolation: test temp memory/worktree roots.
- Worktree ids / result ids / integration check ids: seeded fixture records
  two ready worktree ids, matching scheduler IntegrationCheck handoff, and a
  passed IntegrationCheck record.
- Source-root mutation gate checked: discard completion records before/after
  source status and asserts source files are unchanged.
- Out-of-scope source mutation check: read-only fake Codex is used for terminal
  prompt-context checks so no source mutation occurs.
- Tested with:
  `npx vitest run tests/slow/workbench-scheduler-discard-completion-flow.test.ts`
  and `npm run test:workbench:slow:scheduler`.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Checked boundary: fake Codex remains a test-only runtime bridge. It can be
  configured read-only for prompt-context tests, and mutable only for tests that
  intentionally need a worktree diff. It does not become product runtime
  behavior.
- Tested with: scheduler discard completion and scheduler aggregate.

## Proposal / Runtime Boundary Coverage

- Applicable: yes.
- Artifact type and authority classification: seeded scheduler artifacts are
  fixture setup for tests; product scheduler artifacts remain evidence/runtime
  records consumed by production projections/actions. They do not authorize a
  scheduler loop or automatic apply/close.
- Boundary matrix checked: seed writes scoped `changeId`, scheduler lineage ids,
  worktree ids, IntegrationCheck id, source artifact hashes, and accepted
  artifact refs. Production discard/completion actions still re-read the scoped
  targets.
- Out-of-scope execution paths checked: no full-auto, scheduler loop,
  whole-wave dispatch, slot allocator, child Change creation, automatic
  apply/close, or remote merge/push.
- Stale/forged target behavior checked: retained scheduler split tests still
  exercise scoped gate target ids and revalidation.
- Tested with: scheduler split and aggregate tests.

## Goal Loop Boundary Coverage

- Applicable: yes for scheduler terminal handoff prompt/context evidence.
- Persistent Goal/Change scope checked: terminal handoff prompt context is
  scoped to the selected seeded scheduler Change.
- Recommendation authority checked: terminal handoff evidence is prompt/context
  evidence only and does not execute a concrete gate.
- Fallback priority checked: discard completion and scheduler aggregate keep
  concrete scheduler gates separate from Goal Loop context.
- Packet / main-Agent context freshness checked: terminal chat/orchestrator run
  artifacts include compact scheduler terminal handoff prompt evidence without
  action payload or raw markdown.
- Hidden execution / source mutation check: read-only fake Codex is used for
  terminal prompt-context checks.
- ToolPolicyGate / human gate preservation checked: the scheduler flow still
  uses the existing scoped Workbench actions and human-gated transitions.
- Tested with: scheduler discard completion and scheduler aggregate.

## Module Boundary Coverage

- Applicable: yes.
- Owner modules checked:
  - scheduler fixture setup: `tests/unit/workbench/fixtures.ts`;
  - confirmation next-action projection: `src/workbench/projections/read-model/confirmation/typed-workflow.ts`;
  - Workpad role-pipeline running-state projection:
    `src/workbench/projections/read-model/workpad.ts`;
  - DOM stability assertion: `tests/unit/web-app.test.tsx`.
- Moved responsibilities: none across product modules; new scheduler seed setup
  remains test-owned.
- Retained facade responsibilities: public Workbench snapshot/action shapes
  remain compatible.
- Forbidden write-back locations: no new product workflow branches were added
  to broad Workbench or scheduler facades.
- Follow-up split candidates: the seeded scheduler helper is large; if another
  seeded scheduler fixture is added, split scheduler-specific fixtures out of
  `tests/unit/workbench/fixtures.ts`.
- Tested with: targeted Workbench tests, scheduler split/aggregate, standard
  checks.

## Core Mechanism Reuse / Architecture Growth Control Coverage

- Applicable: yes.
- Existing mechanisms reused or strengthened: existing scheduler runtime
  artifacts, workflow-scheduler repositories, scheduler-runtime repositories,
  worktree metadata, IntegrationCheck artifacts, Workbench projections,
  source-safety assertions, and package-script gates.
- New mechanism proposed: no product mechanism. Test-only seeded fixture
  reduces repeated upstream setup.
- Domain-specific logic location: scheduler slow tests and Workbench test
  fixtures.
- Shared cross-cutting logic location: production artifact readers,
  projections, scheduler actions, validation/audit, and IntegrationCheck remain
  the behavior owners.
- Local framework avoided: no alternate scheduler runtime, no fake action
  executor, no new evidence family, no new product projection system.
- Future-cost result: later scheduler tests can target a late-stage capability
  without replaying the whole worker chain, while the retained two-worker
  golden path still protects end-to-end integration.
