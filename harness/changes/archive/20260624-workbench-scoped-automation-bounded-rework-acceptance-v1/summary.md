# workbench-scoped-automation-bounded-rework-acceptance-v1

## Purpose

Validate and minimally harden the existing Workbench scoped automation failure
recovery path. `完全访问权限` already allows local workflow gates including
`result.refresh-rework`, `result.revalidate`, and `result.reaudit`; this change
proves that those gates can be automatically consumed only when they are the
current authoritative primary gate, then continue through validation/audit and
safe `audit.accept` before stopping at human `result.apply`.

This is an acceptance-driven product slice. It must not introduce a second
automation runtime, permission system, projection system, or rework state
machine.

## Scope

In scope:

- Bounded automation over existing current primary gates:
  `result.refresh-rework`, `result.revalidate`, and `result.reaudit`.
- Targeted runtime, revalidation, read-model, DOM, and source-safety tests.
- Minimal product fixes only if acceptance exposes a real gap in scoped target
  payloads, current-gate revalidation, or Workbench projection.
- Real UI acceptance in an E-drive external sandbox.

Out of scope:

- Automatic `planning.generate`.
- Automatic source apply, close/archive, merge, push, remote landing, or
  Harness evolution.
- Full-auto task mode, scheduler loop, multi-worktree parallel executor, slot
  allocator, or child Change auto creation.
- New evidence family, summary layer, local rework state machine, action
  registry, permission system, or projection system.

## Current Status

Completed / ready to close.

## Verification

- Targeted bounded automation/revalidation/read-model/DOM suite passed:
  `npx vitest run tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`.
- Required checks passed before this supplement: `npm run typecheck`,
  `npm run lint`, `npm run test:fast`, and `npm run build`.
- Previous `npm run test:workbench` aggregate timed out after about 424s without
  an assertion failure. Split evidence: `npm run test:workbench:unit` passed.
- Verification-cost supplement: daily `npm run test:workbench` now runs the
  Workbench unit-capability suites in one Vitest invocation and passed in 27.3s.
  Full slow/deep Workbench coverage remains available through
  `npm run test:workbench:release`.
- Default `npm run test` passed after the script change in 159.1s; the remaining
  dominant cost is CLI integration, not Workbench slow aggregation.
- Real Workbench UI acceptance used E-drive sandboxes only:
  - Negative recovery-scope scout: `E:\aho-accept\bounded-rework-v1`.
    Real UI full-access consumed blocked validation/audit recovery gates and
    launched repeated `coder-codex` rework / validation / audit cycles, but the
    accepted demand did not include the README marker required by the fixture's
    validation script. Audit correctly blocked both the README-marker candidate
    and the later validation-script-weakened candidate. Source root stayed
    clean before apply. This is recorded as an acceptance-scenario scope
    conflict, not a product permission failure.
  - Positive acceptance: `E:\aho-accept\bounded-rework-v1-success` with runtime
    home `E:\aho-accept\bounded-rework-v1-success\home`.
    The user created the demand through the real browser UI, manually generated
    and confirmed planning, then selected `完全访问权限` once. Scoped automation
    advanced through `planning.decompose`,
    `planning.decomposition.confirm`,
    `planning.decomposition.assess-readiness`, real `coder-codex` `code.run`,
    validation, audit, safe automatic `audit.accept`, and stopped at the human
    `result.apply` gate.
- Positive run evidence:
  - Change id: `describeautomationmode-bounded-rework-docs-readm`.
  - Automation authorization:
    `automation-authorization-20260624142146-5854b788`.
  - Automation run:
    `automation-run-20260624142146-ec0e240e`,
    `stopReason = "terminal-human-gate"`, max steps `5`.
  - Automation iterations consumed current gates:
    `planning.decompose`, `planning.decomposition.confirm`,
    `planning.decomposition.assess-readiness`, `code.run`, and
    `audit.accept`.
  - Coder run:
    `run-20260624-222150-describeautomationmode-bounded-rework-docs-readm-290bb5`,
    `runtime = "coder-codex"`, `executionMode = "worktree"`, diff stat:
    `docs/README.md | 2 ++`, `src/mode.js | 2 +-`.
  - Validation:
    `run-20260624-222319-describeautomationmode-bounded-rework-docs-readm-39d043`,
    status `passed`, worktree `wt-20260624-222150-de8f2b`, diff hash
    `e5c17978996033a7bc1054854b41c2db95c1675dddce5320b3d6461e140a15cf`.
  - Audit:
    `run-20260624-222323-describeautomationmode-bounded-rework-docs-readm-fc19a6`,
    status `approved`, same worktree and diff hash.
  - Workbench snapshot after automation: `runtimeStatus = waiting-decision`,
    primary gate `single-result-apply`, title `确认应用并本地提交`.
  - External source safety: `git -C E:\aho-accept\bounded-rework-v1-success\src status --short`
    was empty before apply; no automatic source apply occurred.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none. Both acceptance directories were on E drive.
- Extra prompts or reviewer instructions: none beyond ordinary UI planning
  confirmation and one `完全访问权限` confirmation in the positive acceptance.
- Retries or environment failures: old `E:\aho-accept\bounded-rework-v1`
  exposed an acceptance-scenario scope conflict; it was stopped rather than
  forced through. Fresh `bounded-rework-v1-success` completed the positive path.
- Screenshots / artifacts / run ids: recorded above.
- External source/state safety: positive source root stayed clean and stopped at
  `result.apply`; no source mutation occurred before human apply.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: close/handoff updates are in this change.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: close/handoff updates should
  point to this archive and keep detailed sandbox histories archive-only.
- Old experience retained / merged / retired / archive-only: detailed real UI
  sandbox evidence should stay archive-only unless it changes current agent
  decisions.
