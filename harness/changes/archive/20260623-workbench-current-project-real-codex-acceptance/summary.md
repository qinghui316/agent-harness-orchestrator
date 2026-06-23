# workbench-current-project-real-codex-acceptance

## Purpose

Run a real Workbench acceptance on the current AHO repository itself. The
acceptance must prove or block the implemented manual-gated product path from a
Workbench demand through planning, decomposition/readiness, real Codex
`code.run`, validation/audit, result review, human apply, and close/archive.

This change exists to separate real product evidence from fake fixture evidence.
It must not use demo repositories, fake Codex binaries, mocked PATH entries,
fixture results, or hand-written run artifacts as pass evidence.

## Scope

In scope:

- The completed same-root acceptance attempt on the current AHO repository as
  negative source-safety evidence.
- A corrected formal rerun that uses an external sandbox copy as the Workbench
  managed project, so AHO product development state and acceptance target state
  do not share one source root.
- The current active change as the selected Workbench demand/topic in AHO
  product evidence, without creating a second repo-local active change in the
  development repository.
- Real Workbench server/UI or server API action path evidence.
- Real Codex `code.run` evidence from `coder-codex` worktree execution.
- Validation, audit, result review, source apply safety, and close/archive
  evidence when the path reaches those gates.
- Blocker classification if any stage cannot complete without fake evidence.

Out of scope:

- Full-auto task mode, scheduler loop, parallel executor, slot allocator, child
  Change auto creation, remote push/merge, or remote PR handoff.
- Demo repo acceptance, fake Codex acceptance, mocked Codex acceptance, or
  fixture-only acceptance.
- Handling the unrelated untracked `README.md` unless the user separately asks
  to include it.

## Current Status

Completed / Ready to close. The real Workbench/Codex acceptance reached the
local manual-gated close/archive path in external sandbox `a10` without using
fake Codex, fixture results, hand-written artifacts, remote PR creation, push,
or merge. Same-root runtime state has already been migrated out of the
repository root; final apply/close evidence comes only from external sandbox
managed project `C:\aho-accept\a10\src` and external AHO runtime home
`C:\aho-accept\a10\home`.

The latest external reruns changed the blocker classification:

- `a6` (`C:\aho-accept\a6\src`, external home `C:\aho-accept\a6\home`) proved
  real UI demand -> planning -> decomposition/readiness -> real `coder-codex`
  worktree `code.run` can start and complete with the coder worktree dependency
  bridge. Run
  `run-20260622-183445-aho-ci-current-project-real-codex-acceptance-f23ca4`
  recorded `runtime="coder-codex"`, `executionMode="worktree"`, and
  `code.dependency_bridge.prepared`.
- The same `a6` rerun did not reach audit/apply/close. Validation used the
  package fallback `default` profile and entered full `npm run test`, including
  slow Workbench scheduler aggregate execution. `typecheck` and `lint` passed;
  validation was stopped through the UI after it exceeded the real-acceptance
  window in slow validation. This is validation-profile/signal topology debt,
  not a fake pass.
- `a8` proved a bounded real default validation profile can be supplied in
  external memory `harness/config/environment.json` without dirtying the source
  root, but the rerun exposed a stronger product blocker: while a
  `planning.generate` run was active, the same visible confirmation remained
  clickable and started duplicate Codex planning runs. UI stop requests were
  needed to stop both runs.

Resolved blocker classification:
`product path bug: duplicate in-flight workflow action accepted`. Workbench now
fails closed or disables/suppresses the selected-demand primary confirmation
while its scoped action is already running. The fix stayed in existing
Workbench action/projection/UI owners and did not add automation, scheduler
loops, or evidence families.

Final external sandbox `a10` outcome:
real browser UI evidence reached demand creation, planning, confirmation,
decomposition/readiness, real `coder-codex` `code.run`, validation failure,
bounded rework, validation pass, audit approval, UI `audit.accept`, UI
`result.apply` with local commit, landing readiness refresh, and
human-confirmed `change.close`. The sandbox source was clean before apply and
clean after close. The archived acceptance path is
`C:\aho-accept\a10\home\projects\aho-accept-a10\harness\changes\archive\20260623-aho-ci-current-project-real-codex-acceptance`.

Two final product issues were fixed during `a10`:

- Workbench now forwards `result.apply` options from the read model through the
  frontend action payload, so the existing commit-capable apply path can be
  exposed as the primary human gate for local acceptance.
- Landing readiness can attribute source diff evidence from a committed
  Workbench apply by reading the apply run artifact and verifying the current
  source `HEAD` matches `apply.sourceHeadAfter`.

One UI projection gap remains as follow-up evidence, not a close blocker:
immediately before close, the server confirmation queue correctly selected
`change.close` as the primary gate, while the right-side decision inspector
still displayed an old failed result card. The `change.close` action was
therefore submitted through the same project-scoped Workbench action endpoint
using the exact payload from the current confirmation queue.

The original Codex startup blocker was resolved in AHO source by passing a
process-scoped Codex runtime override (`-c service_tier="fast"`) to app-server
and `codex exec`, instead of mutating `C:\Users\qinghui\.codex\config.toml`.
The isolated worktree dependency blocker was also resolved in AHO source by
preparing a validation-time `node_modules` bridge from the source root when the
source dependencies exist.

The latest real UI rerun reached:

`result.refresh-rework -> real coder-codex code.run -> validation passed -> audit approved-with-notes -> UI audit.accept -> result review dirty-source`

The earlier `tests/unit/web-app.test.tsx` `agent-run-graph` validation failure
no longer reproduces in current source or the old candidate worktree. No fake
pass was used. Result apply and close/archive were correctly not attempted
because the source root is dirty with active implementation changes plus the
unrelated untracked `README.md`.

The same-root setup is now classified as the acceptance design error that caused
the source-safety blocker. The repo-root `.agent-harness/` runtime directory was
migrated to
`C:\Users\qinghui\.agent-harness\acceptance-archives\aho-real-codex-20260622-same-root\repo-root-agent-harness\`
so the main development repository no longer contains nested Workbench runtime
state. Product fixes remain in the development repository; acceptance runtime
evidence is external.

## Verification

- Preflight:
  - `git status --short`: `?? README.md` only.
  - `codex --version`: `codex-cli 0.128.0`.
  - `npm run build`: passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 preflight`: passed; safe to create a structured change.

Fresh external-sandbox UI acceptance evidence will be recorded after the next
formal rerun.

- Duplicate in-flight action fix verification:
  - `npx vitest run tests/unit/workbench-action-service.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/validation.test.ts tests/slow/workbench-demand-to-execution-golden-flow.test.ts`: passed.
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm run test:fast`: passed.
  - `npm run build`: passed.
  - `npm run test:workbench`: passed.
  - Harness checks passed: `lint-ecl`, `lint-encoding`,
    `harness-change reindex`, `harness-change status`, and
    `harness-evolve check`.

- Workbench project:
  - project id: `aho-self`
  - source root: `E:\个人项目\agent-harness-orchestrator`
  - marker: `.agent-harness/project.json`
- Workbench demand/topic id:
  `workbench-current-project-real-codex-acceptance`
- Change id: `workbench-current-project-real-codex-acceptance`
- Primary confirmation queue evidence:
  - `planning.decompose`: one primary gate,
    `workflow:planning.decompose:workbench-current-project-real-codex-acceptance`.
  - `planning.decomposition.confirm`: one primary gate,
    `workflow:planning.decomposition.confirm:workbench-current-project-real-codex-acceptance:decomposition-1782039046119-5646a1`.
  - `planning.decomposition.assess-readiness`: one primary gate,
    `workflow:planning.decomposition.assess-readiness:workbench-current-project-real-codex-acceptance:decomposition-1782039046119-5646a1`.
  - `code.run`: one primary gate,
    `workflow:code.run:workbench-current-project-real-codex-acceptance:readiness-1782039068602-fbf009`.
- Planning/decomposition evidence:
  - DecompositionPlan:
    `harness/changes/active/workbench-current-project-real-codex-acceptance/planning/decomposition-plan.json`,
    id `decomposition-1782039046119-5646a1`, status `confirmed`,
    `executionStarted=false`.
  - Readiness manifest:
    `harness/changes/active/workbench-current-project-real-codex-acceptance/planning/decomposition-readiness.json`,
    id `readiness-1782039068602-fbf009`, status
    `ready-for-single-change`, `nextAllowedAction="code.run"`,
    `executionStarted=false`.
- Real Codex run evidence:
  - First run:
    `.agent-harness/runs/run-20260621-185130-workbench-current-project-real-codex-acceptance-99161a/run.json`
    recorded `runtime="coder-codex"` and `executionMode="worktree"`, but
    `codex app-server --listen stdio://` failed before producing a diff.
  - Product fix applied during acceptance: `src/codex/app-server.ts` now uses a
    startup smoke check before selecting the app-server adapter, so invalid
    app-server configuration falls back to `codex exec`.
  - Second run:
    `.agent-harness/runs/run-20260621-185438-workbench-current-project-real-codex-acceptance-73d710/run.json`
    recorded `runtime="coder-codex"`, `executionMode="worktree"`,
    command `codex exec --json --sandbox workspace-write --cd
    C:\Users\qinghui\.agent-harness\worktrees\aho-self\checkouts\wt-20260621-185439-7b6919`,
    and worktree id `wt-20260621-185439-7b6919`.
  - Required Codex artifacts for the second run:
    `codex-events.jsonl`, `last-message.md`, `diff.patch`, and
    `diff-stat.txt` exist under
    `.agent-harness/runs/run-20260621-185438-workbench-current-project-real-codex-acceptance-73d710/`.
  - `codex-events.jsonl`, `diff.patch`, and `diff-stat.txt` are empty because
    Codex exited before producing JSONL output or a worktree diff.
  - Product fix applied during acceptance: `src/codex/capabilities.ts` now
    prepends `-c service_tier="fast"` to Codex exec argv builders, and
    `src/codex/app-server.ts` uses the same override for app-server startup and
    turns.
  - Latest successful coder run:
    `.agent-harness/runs/run-20260621-192358-workbench-current-project-real-codex-acceptance-eb903e/run.json`
    recorded `runtime="coder-codex"`, `executionMode="worktree"`,
    command `codex -c service_tier="fast" --ask-for-approval never exec
    --json --color never --sandbox workspace-write --cd
    C:\Users\qinghui\.agent-harness\worktrees\aho-self\checkouts\wt-20260621-192358-1c39d2`,
    and worktree id `wt-20260621-192358-1c39d2`.
  - Required Codex artifacts for the latest successful coder run exist:
    `codex-events.jsonl`, `last-message.md`, `diff.patch`, and
    `diff-stat.txt`.
  - Latest diff evidence:
    `.agent-harness/runs/run-20260621-192358-workbench-current-project-real-codex-acceptance-eb903e/diff-stat.txt`
    reports 2 changed files, 41 insertions:
    `docs/CURRENT-DEVELOPMENT-PLAN.md` and `package.json`.
- Validation evidence:
  - `.agent-harness/runs/run-20260621-192826-workbench-current-project-real-codex-acceptance-7ee6d0/run.json`
    recorded `runtime="validator"`, `executionMode="worktree"`,
    worktree id `wt-20260621-192358-1c39d2`, diff hash
    `76b52275423ac4405bf1a01fd6d9d257010c0218619c85ec4f1d458824b25271`,
    and status `failed`.
  - Validation attempted `npm run typecheck`, `npm run lint`,
    `npm run test`, and `npm run build` in the worktree. All failed because
    the worktree could not resolve `tsc`, `eslint`, or `vitest`.
- Dependency bridge and formal rerun evidence:
  - Source product fix:
    - `src/worktree/dependencies.ts` prepares the validation worktree
      dependency bridge.
    - `src/validation/service.ts` invokes the bridge before worktree
      validation commands and fails closed if source dependencies are absent.
    - `src/audit/diff.ts` excludes `node_modules` from untracked worktree diff
      collection.
    - `src/runtime-continuity/repository.ts` serializes concurrent
      `agent-events.jsonl` appends after the first formal rerun exposed
      corrupted runtime-continuity JSONL.
  - Targeted source verification:
    `npx vitest run tests/unit/runtime-continuity.test.ts tests/unit/validation.test.ts tests/unit/worktree.test.ts tests/unit/codex.test.ts`
    passed.
  - Mechanical source verification:
    `npm run typecheck`, `npm run lint`, `npm run test:fast`, and
    `npm run build` passed.
  - Formal rerun coder evidence:
    `.agent-harness/runs/run-20260622-010017-workbench-current-project-real-codex-acceptance-1c6316/run.json`
    recorded `runtime="coder-codex"`, `executionMode="worktree"`,
    status `completed`, exit code `0`, and worktree id
    `wt-20260622-010018-72c3ee`.
  - Runtime continuity fix evidence:
    the same run recorded 320 parseable `agent-events.jsonl` entries; the
    prior rerun
    `run-20260622-005105-workbench-current-project-real-codex-acceptance-d0856b`
    had repeated `runtime_continuity.append_failed` entries from an invalid
    `agent-events.jsonl` journal.
  - Formal rerun validation evidence:
    `.agent-harness/runs/run-20260622-010936-workbench-current-project-real-codex-acceptance-1d93ec/validation.json`
    recorded `runtime="validator"`, `executionMode="worktree"`, status
    `passed`, and passed `npm run typecheck`, `npm run lint`,
    full `npm run test`, and `npm run build`. This proves the dependency bridge
    fixed the earlier missing `tsc`/`eslint`/`vitest` blocker.
  - Formal rerun audit evidence:
    `.agent-harness/runs/run-20260622-013216-workbench-current-project-real-codex-acceptance-ff887c/audit.json`
    recorded status `blocked` because the candidate worktree added an unrelated
    fake `README.md` artifact.
  - Formal rerun rework evidence:
    `.agent-harness/runs/run-20260622-013308-workbench-current-project-real-codex-acceptance-507969/run.json`
    recorded `runtime="coder-codex"`, `executionMode="worktree"`, status
    `completed`, exit code `0`, and diff-stat without the fake `README.md`.
  - Latest validation evidence:
    `.agent-harness/runs/run-20260622-013912-workbench-current-project-real-codex-acceptance-2475c5/validation.json`
    recorded status `failed`: `typecheck`, `lint`, and `build` passed, but
    `npm run test` failed in `tests/unit/web-app.test.tsx` at
    `screen.findByTestId("agent-run-graph")`.
  - Historical result review after that earlier run:
    Workbench snapshot reports `status="needs-rework"` for
    `wt-20260622-013308-269724`; apply readiness is blocked by dirty source and
    no apply gate is eligible.
  - Current-source diagnostic:
    `npx vitest run tests/unit/web-app.test.tsx` passed in the source root.
    The same command also passed in old candidate worktree
    `C:\Users\qinghui\.agent-harness\worktrees\aho-self\checkouts\wt-20260622-013308-269724`,
    so the earlier `agent-run-graph` failure is no longer a current product
    blocker.
  - Real browser UI continuation evidence:
    the Workbench server was opened at `http://127.0.0.1:4317` and the selected
    demand/topic `workbench-current-project-real-codex-acceptance` was driven
    through visible confirmation gates. Screenshots were captured under
    `.agent-harness/ui-evidence/`, including
    `workbench-real-ui-20260622-rework-gate-visible.png`,
    `workbench-real-ui-20260622-audit-rework-before.png`,
    `workbench-real-ui-20260622-audit-rework-confirmed.png`, and
    `workbench-real-ui-20260622-dirty-source-apply-blocker.png`.
  - Latest UI-triggered coder run:
    `.agent-harness/runs/run-20260622-045208-workbench-current-project-real-codex-acceptance-efe3e6/run.json`
    recorded `runtime="coder-codex"`, `executionMode="worktree"`, status
    `completed`, and worktree id `wt-20260622-045208-b2d6f4`.
  - Latest validation evidence:
    `.agent-harness/runs/run-20260622-050124-workbench-current-project-real-codex-acceptance-ebc584/validation.json`
    recorded status `passed` for `wt-20260622-045208-b2d6f4`, including
    `npm run typecheck`, `npm run lint`, full `npm run test`, and
    `npm run build`; diff hash
    `d120b002a1db4026d5a971dd1af2e3e7d75fdb3a8fbf27ada8d13f805b61e0b4`.
  - Latest audit evidence:
    `.agent-harness/runs/run-20260622-052800-workbench-current-project-real-codex-acceptance-4f21a6/audit.json`
    recorded status `approved-with-notes` for the same worktree and validation.
    The UI then accepted that audit through the visible `audit.accept` gate.
  - Latest result review:
    after `audit.accept`, the Workbench snapshot reports `status="not-ready"`
    with apply readiness kind `dirty-source`. The primary available result
    actions are status/evidence/discard; no `result.apply` action is exposed.
  - Apply source safety:
    apply was not attempted. `git status --short` showed the source root dirty
    with this active implementation/doc/test work plus unrelated untracked
    `README.md`, so this is a source-safety blocker rather than a Codex,
    validation, or audit blocker.
  - Mechanical verification after source/test updates:
    `npx vitest run tests/unit/web-app.test.tsx` passed in both source root and
    the old candidate worktree; `npm run test:integration`, `npm run typecheck`,
    `npm run lint`, `npm run test:fast`, and `npm run build` passed.
  - Workbench aggregate verification:
    `npm run test:workbench` was attempted and hit the 15-minute tool timeout
    without failure output. The same aggregate members were run split and
    passed: `npm run test:workbench:unit`,
    `npm run test:workbench:slow:scheduler`,
    `tests/slow/workbench-demand-to-execution-golden-flow.test.ts`,
    `tests/slow/workbench-remote-landing-flow.test.ts`,
    `tests/slow/workbench-apply-integration-flow.test.ts`,
    `tests/slow/workbench-maintenance-flow.test.ts`, and
    `tests/slow/workbench-goal-loop-prompt-flow.test.ts`.
- Blocker classification:
  - Resolved blocker: environment/provider Codex config startup failure caused
    by user-level `service_tier = "default"`.
  - Resolved blocker: product path / environment dependency setup for isolated
    validation worktrees.
  - Resolved blocker: runtime-continuity `agent-events.jsonl` concurrent append
    corruption during high-volume Codex runs.
  - Resolved blocker: stale Workbench DOM `web-app.test.tsx` run-graph
    validation signal; current source and old candidate worktree both pass.
  - Resolved blocker: same-root source safety. The same-root managed-project
    approach is retired for this acceptance, and formal source mutation evidence
    now comes from external sandbox source roots and external AHO runtime homes.
  - Resolved blocker: sandbox `a9` reached human-gated UI apply and landing
    readiness, but close/archive remained blocked because UI apply did not
    create a local commit or otherwise clean the source root before close. The
    `a10` rerun used the existing commit-capable apply path and closed.
  - Codex project trust extension:
    `src/codex/trust.ts` now detects the selected project's Codex trust state
    from `CODEX_HOME` or user `.codex/config.toml`; Workbench project status
    exposes that state; `POST /api/projects/:id/codex/trust` requires
    `confirm: true` and writes only the selected project's trusted entry; the
    project details panel shows a human project-level action rather than
    mutating Codex config at server startup.
  - Codex project trust verification:
    `npx vitest run tests/unit/codex-trust.test.ts tests/unit/workbench-server.test.ts`,
    `npm run typecheck`, `npm run lint`, `npm run test:fast`, and
    `npm run build` passed.
  - External-local memory bridge selection blocker:
    the external sandbox Workbench UI rerun at `http://127.0.0.1:4320`
    confirmed Codex project trust, then selected Codex app-server for
    `planning.generate`. The run completed, but app-server could only see the
    sandbox source root and attempted to infer AHO state without the external
    memory root. That planning output is not valid pass evidence.
  - External-local memory bridge selection fix:
    `src/codex/app-server.ts` now exposes app-server suitability by memory
    mode; `src/workbench/codex-chat/bridge.ts` and `src/code/manager.ts` skip
    app-server in external-local mode and record `app-server.skipped`;
    `src/code/codex-exec-runner.ts` passes the external memory root to Codex
    exec; `src/codex/capabilities.ts` includes `--add-dir` support for
    workspace-write argv.
- External-local memory bridge verification:
    `npx vitest run tests/unit/codex.test.ts tests/unit/codex-trust.test.ts tests/unit/workbench-server.test.ts`,
    `npm run typecheck`, `npm run lint`, `npm run test:fast`, and
    `npm run build` passed.
  - External sandbox UI rerun evidence after the memory bridge:
    Workbench at `http://127.0.0.1:4321` opened external sandbox
    `C:\aho-accept\a1\src` with external home `C:\aho-accept\a2\home`.
    The browser UI showed one primary gate at a time through
    `确认规划 -> 生成拆分提案 -> 确认拆分方向 -> 检查执行边界 -> 运行 Code`.
    `run-20260622-154907-current-project-real-codex-acceptance-7cd191`
    recorded `runtime="coder-codex"`, `executionMode="worktree"`, and
    `--add-dir C:\aho-accept\a2\home\projects\ahoacc1`.
  - External sandbox validation result:
    the first validation failed because `a1` was not a complete AHO git project;
    `AGENTS.md` and `docs/ECL.md` existed in the source directory but were not
    tracked, so the generated git worktree lacked files required by the current
    validation suite. Bounded rework then produced
    `run-20260622-155641-current-project-real-codex-acceptance-d5e72f`, but the
    follow-up validation
    `run-20260622-160517-current-project-real-codex-acceptance-e64131` failed
    after 23 minutes because an existing slow remote landing test exceeded the
    default 30s per-test timeout.
  - Product fixes from that rerun:
    `src/harness/init.ts` no longer overwrites a non-generated existing
    `AGENTS.md` during external-local initialization, and
    `tests/slow/workbench-remote-landing-flow.test.ts` gives the slow remote
    merge acceptance an explicit timeout.
  - Product-fix verification:
    `npx vitest run tests/unit/harness.test.ts`,
    `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`,
    `npm run typecheck`, `npm run lint`, `npm run build`, and
    `npm run test:fast` passed.
  - No fake result, fixture result, hand-written run artifact, apply, or close
    was used as a substitute.
  - Fresh external sandbox `a9` evidence after the duplicate in-flight action
    fix:
    Workbench was served at `http://127.0.0.1:4327` for project
    `aho-accept-a9`, source root `C:\aho-accept\a9\src`, external runtime home
    `C:\aho-accept\a9\home`. The UI showed one primary gate at a time through
    demand creation, planning, planning confirmation, decomposition,
    decomposition confirmation, readiness, `code.run`, validation failure
    rework, audit acceptance, and apply. Screenshots were saved under
    `C:\aho-accept\a9\ui-evidence\`.
  - `a9` duplicate-action evidence:
    during `planning.generate`, `code.run`, `result.refresh-rework`,
    `audit.accept`, and `result.apply`, the visible confirmation buttons were
    disabled while the scoped action was running. The `code.run` running
    screenshot is
    `C:\aho-accept\a9\ui-evidence\a9-code-run-running-disabled.png`.
  - `a9` real Codex evidence:
    initial code run
    `C:\aho-accept\a9\home\projects\aho-accept-a9\runs\run-20260622-211620-aho-ci-current-project-real-codex-acceptance-662e1b\run.json`
    recorded `runtime="coder-codex"` and `executionMode="worktree"` and
    produced a real docs diff. Bounded rework runs
    `run-20260622-212141-aho-ci-current-project-real-codex-acceptance-c53b35`,
    `run-20260622-213004-aho-ci-current-project-real-codex-acceptance-531a8a`,
    and `run-20260622-213559-aho-ci-current-project-real-codex-acceptance-b21c60`
    stayed in real `coder-codex` worktree mode. Required artifacts
    `run.json`, `codex-events.jsonl`, `last-message.md`, `diff.patch`, and
    `diff-stat.txt` exist for those real Codex runs.
  - `a9` validation/audit/apply evidence:
    validation
    `C:\aho-accept\a9\home\projects\aho-accept-a9\runs\run-20260622-214027-aho-ci-current-project-real-codex-acceptance-8fa60b\validation.json`
    passed `typecheck`, `lint`, `test:fast`, and `build` for worktree
    `wt-20260622-213600-18c040`. Audit
    `C:\aho-accept\a9\home\projects\aho-accept-a9\runs\run-20260622-214145-aho-ci-current-project-real-codex-acceptance-56089f\audit.json`
    recorded status `approved` with zero findings. Workbench UI then accepted
    audit and exposed human-gated `result.apply`. Before apply,
    `git -C C:\aho-accept\a9\src status --short` was empty. After apply, source
    status was `M docs/WORKBENCH.md` and
    `?? tests/unit/workbench-real-codex-acceptance-doc.test.ts`.
  - `a9` landing attribution blocker and fix:
    first landing package `landing-worktree-9616db6b668a` was incorrectly
    classified as `unattributed-dirty-source` because the source patch and
    expected worktree patch differed only by final CRLF/LF normalization. AHO
    now uses a landing-specific normalized patch hash and exposes a
    `landing.refresh` action on failed landing packages. Targeted verification
    passed:
    `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts -t
    "prepares a local landing package" --reporter=verbose`, `npm run
    typecheck`, and `npm run build`. Re-running `landing.refresh` through the
    project-scoped Workbench action path changed the package to `ready`, with
    `sourceDiffHash` equal to expected hash
    `64ea830c1b14eb35d0807e78d35364d86cc245748eecff7dc875e4b101be0f0e`.
  - Historical `a9` close blocker:
    `a9` did not complete close/archive because UI apply left the sandbox
    source dirty and the next visible primary gate was Draft PR creation, which
    was outside local-only acceptance scope. This is resolved by the `a10`
    committed-apply rerun.

- Final external sandbox `a10` acceptance evidence:
  - Workbench URL: `http://127.0.0.1:4328`.
  - Project id: `aho-accept-a10`.
  - Source root: `C:\aho-accept\a10\src`.
  - External runtime home: `C:\aho-accept\a10\home`.
  - Demand/change id: `aho-ci-current-project-real-codex-acceptance`.
  - Real Codex code run:
    `C:\aho-accept\a10\home\projects\aho-accept-a10\runs\run-20260623-014343-aho-ci-current-project-real-codex-acceptance-47649d\run.json`
    recorded `runtime="coder-codex"` and `executionMode="worktree"`.
    Required artifacts `codex-events.jsonl`, `last-message.md`, `diff.patch`,
    and `diff-stat.txt` exist for that run.
  - Bounded rework run:
    `run-20260623-015011-aho-ci-current-project-real-codex-acceptance-fc2316`
    recorded real `coder-codex` worktree execution after validation exposed a
    stale `tests/unit/web-app.test.tsx` run-graph candidate failure.
  - Validation:
    `run-20260623-015616-aho-ci-current-project-real-codex-acceptance-cfe68a`
    passed for worktree `wt-20260623-015012-b2de1b` with diff hash
    `197e191d0288d92515dc86084e912c065f9cc10f61d4632841a4cf3f9f88c383`.
  - Audit:
    `run-20260623-015712-aho-ci-current-project-real-codex-acceptance-edf622`
    approved the candidate and the UI accepted the audit.
  - Apply:
    `run-20260623-015903-aho-ci-current-project-real-codex-acceptance-40ea3b`
    recorded `status="applied"`, `committed=true`, and commit
    `15017ad093b68d10077d1cd23a7745e1986c5a8f`.
    `git -C C:\aho-accept\a10\src status --short` was empty before apply and
    empty after apply/close.
  - Landing readiness:
    package `landing-worktree-3472734bfb82` first exposed a product bug where
    committed apply evidence produced a clean source tree and an empty current
    source diff. `src/landing/service.ts` now reads the committed apply
    artifact and verifies source `HEAD` before using that diff for landing
    readiness. Re-running `landing.refresh` changed the package to ready.
  - Close/archive:
    current confirmation queue selected
    `confirm:approval:close:aho-ci-current-project-real-codex-acceptance` as
    primary with action `change.close`. The browser UI did not visibly expose
    that close card because the decision inspector still displayed an old
    failed result card, so the same scoped Workbench action payload was
    submitted through the server action endpoint. The demand archived at
    `C:\aho-accept\a10\home\projects\aho-accept-a10\harness\changes\archive\20260623-aho-ci-current-project-real-codex-acceptance`.
  - Final source verification after main-repo fixes and timeout updates:
    `npm run typecheck`, `npm run lint`, `npm run test:fast`, and
    `npm run build` passed. `npm run test:workbench` exceeded the tool window,
    but its split members passed: Workbench unit, scheduler slow, and the
    remaining slow suites including the four timeout-repaired slow tests.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: two early real `code.run` attempts failed on
  the user-level Codex configuration issue; after the process-scoped override,
  real `coder-codex` runs completed and produced diffs. The dependency bridge
  rerun passed validation once, then audit triggered bounded rework. The latest
  UI continuation passed validation and audit and stopped at source-safety
  dirty-source apply readiness.
- Screenshots / artifacts / run ids:
  - `run-20260621-185130-workbench-current-project-real-codex-acceptance-99161a`
  - `run-20260621-185438-workbench-current-project-real-codex-acceptance-73d710`
  - `run-20260621-192358-workbench-current-project-real-codex-acceptance-eb903e`
  - `run-20260621-192826-workbench-current-project-real-codex-acceptance-7ee6d0`
  - `run-20260622-010017-workbench-current-project-real-codex-acceptance-1c6316`
  - `run-20260622-010936-workbench-current-project-real-codex-acceptance-1d93ec`
  - `run-20260622-013216-workbench-current-project-real-codex-acceptance-ff887c`
  - `run-20260622-013308-workbench-current-project-real-codex-acceptance-507969`
  - `run-20260622-013912-workbench-current-project-real-codex-acceptance-2475c5`
  - `run-20260622-045208-workbench-current-project-real-codex-acceptance-efe3e6`
  - `run-20260622-050124-workbench-current-project-real-codex-acceptance-ebc584`
  - `run-20260622-052800-workbench-current-project-real-codex-acceptance-4f21a6`
- External source/state safety: current AHO repository is the source project;
  `README.md` is an unrelated untracked file and remains out of scope. It is
  part of the current dirty-source apply blocker, together with the active
  implementation/doc/test changes.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: fixed app-server
  capability detection so app-server startup/configuration failures do not
  incorrectly block fallback to `codex exec`; added process-scoped Codex
  runtime config override so the known `service_tier = "default"` user config
  failure does not prevent AHO-managed Codex runs from starting. Added
  explicit Codex project trust detection plus a human-confirmed project action
  after the Codex desktop trust warning showed that project-local Codex config,
  hooks, and exec policies are ignored until the project is trusted.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
