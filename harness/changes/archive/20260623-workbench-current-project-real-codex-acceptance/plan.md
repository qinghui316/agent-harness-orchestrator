# Plan: workbench-current-project-real-codex-acceptance

## Approach

Use the same-root AHO repository attempt only as already-captured
source-safety evidence. Continue formal acceptance through an external sandbox
managed project so the AHO development repository, Workbench runtime home, and
acceptance target source root are separated. Drive the flow through
Workbench/server action paths and record real artifacts.

## Steps

1. Record preflight evidence: git status, Codex version, build, and Harness
   preflight.
2. Update active change files so the acceptance has explicit ACs, tasks, and
   review coverage before running product actions.
3. Start or use the built Workbench server with an external AHO runtime home and
   an external sandbox source root, not the AHO development repository root.
4. Use the Workbench action path on selected topic
   `workbench-current-project-real-codex-acceptance`:
   `planning.generate`, `planning.confirm-execution`, `planning.decompose`,
   `planning.decomposition.confirm`,
   `planning.decomposition.assess-readiness`, and then `code.run` only when the
   readiness manifest allows it.
5. Use the acceptance task prompt:
   "为 AHO 增加一个非 CI 的 current-project real Codex acceptance 入口或说明，明确如何用当前项目跑真实 Workbench/Codex 验收，并区分它和 fake fixture 测试。"
6. Capture `coder-codex` run artifacts and Workbench snapshots after each gate.
7. If result review reaches ready-to-apply, record `git status --short` in the
   external sandbox source root, then use the Workbench human-gated apply
   action. If source safety blocks, record the blocker and do not bypass it.
8. If apply succeeds, use the Workbench human-gated close action and record the
   archive path.
9. Run mechanical verification for the final source/doc state and close/handoff
   checks.

## Extension: Worktree Dependency Resolution Bridge

The current real acceptance is blocked inside the same product path: validation
is executed in an AHO-owned git worktree, but Node package resolution still
expects a local `node_modules` tree at the checkout root. This is an acceptance
supplement for the active change, not a new product direction.

Implementation approach:

- Add an owned helper under the worktree or validation domain that prepares a
  dependency bridge for worktree validation.
- If the source root has `node_modules` and the worktree checkout does not,
  create a `node_modules` junction on Windows or symlink on other platforms that
  points from the worktree checkout to the source root dependency tree.
- If source dependencies are missing, fail closed before validation commands run
  with a clear dependency setup error.
- Do not run `npm install`, `npm ci`, or any package manager install command.
- Treat the bridge as validation execution setup only. It is not dependency
  isolation, security sandboxing, source change evidence, or apply content.
- Connect the helper to validation worktree execution first. Keep coder-run
  setup unchanged unless the formal rerun exposes the same dependency blocker in
  Codex self-check behavior.

## Extension: Validation Signal Recheck And Real UI Evidence

The earlier formal rework validation failed in `tests/unit/web-app.test.tsx`
while waiting for `agent-run-graph`. Before triggering another Codex rework,
recheck whether the failure is stable:

- Run `tests/unit/web-app.test.tsx` in the current source root.
- Run the same test and `npm run test:fast` in candidate worktree
  `wt-20260622-013308-269724`.
- If the failure reproduces, classify it as candidate quality, product
  UI/projection bug, or fixture leakage and fix through the smallest owner.
- If the failure does not reproduce, continue through the real Workbench action
  path with fresh validation/audit evidence rather than treating stale failure
  output as current truth.
- Start the Workbench UI in a browser and record real visible-surface evidence
  for the selected topic before claiming UI acceptance.

Outcome: current source and the old candidate worktree both pass
`tests/unit/web-app.test.tsx`; the earlier blocker was dirty-source apply
safety, not the old run-graph validation signal. The later `a10` rerun resolved
the local close path with committed apply.

## Decisions

- The acceptance uses the current active change as the Workbench topic to avoid
  two concurrent repo-local active changes.
- The same-root source root approach is retired for formal apply/close
  acceptance because it mixes product development changes with acceptance target
  state.
- Planning fallback output is allowed as intermediate planning UX evidence but
  is not real Codex success evidence.
- Real success evidence is anchored on the `code.run` `coder-codex` worktree
  run artifacts.
- Source root mutation is only allowed through Workbench `result.apply`.
- The unrelated untracked `README.md` remains outside this change and should
  not be used as the formal acceptance source root blocker after the sandbox
  rerun.
- Worktree dependency bridging is allowed for validation because worktrees do
  not isolate dependencies; the bridge must remain ignored by git and absent
  from diff/apply semantics.

## Module Boundary Plan

- Owner module: existing Workbench action handlers, server action
  revalidation, runtime role-stage runner, code manager, validation/audit
  managers, worktree apply, close lifecycle, plus an owned worktree/validation
  helper for dependency bridge setup.
- New / moved responsibilities: worktree validation dependency bridge setup and
  fail-closed diagnostics.
- Facade touch points: existing Workbench server/action facades only as
  entrypoints.
- Forbidden write-back locations: no fake runner helpers, no broad facade
  feature logic, no hand-written run artifacts, and no manual edits to
  `harness/changes/INDEX.json`.
- Compatibility surface: existing Workbench action payloads and CLI/Harness
  lifecycle remain compatible.
- Boundary tests: targeted dependency bridge tests, validation worktree command
  resolution tests, diff exclusion tests, and real acceptance rerun.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Workbench action registry,
  scoped action target revalidation, ToolPolicy/human gates, planning bundle,
  decomposition readiness, `code.run`, AHO-owned worktrees, validation, audit,
  result review, source apply safety, and ECL close/archive.
- Why existing mechanisms are insufficient if a new mechanism is proposed:
  existing worktree creation isolates files but does not prepare package-manager
  dependency resolution for validation commands.
- Domain-specific logic location: any Codex-produced low-risk acceptance
  implementation should remain in existing docs or acceptance script surfaces.
- Shared cross-cutting logic location: existing artifact, worktree,
  validation/audit, action, and Harness owners.
- Local framework / state machine / projection / validation / gate avoided:
  avoids new evidence families, fake runner framework, local gate variants, and
  scheduler/full-auto paths.
- Future-cost reduction for similar features: records a real-project acceptance
  pattern that future runtime/apply changes can reuse without making real Codex
  mandatory for every change.

## Planning-Discovered Gaps

- Workbench `planning.generate` can fall back to deterministic AHO output when
  Codex planning runtime is unavailable, so it must not be counted as real
  Codex success.
- Current repo has active development changes and a pre-existing untracked
  `README.md`; same-root apply safety can block even if the Codex worktree
  result is valid. Formal apply/close acceptance therefore needs an external
  sandbox source root.

## Extension: Same-Root Runtime Cleanup And Sandbox Rerun

The repo-root `.agent-harness/` directory was created by using the AHO
development repository as the Workbench managed project. That runtime state is
real evidence, but it is not product source and should not remain nested in the
development repository.

Execution approach:

- Preserve the same-root evidence by moving `.agent-harness/` to an external
  acceptance archive.
- Keep AHO product fixes and active ECL evidence in the development repository.
- Create or refresh an external sandbox source root for the formal acceptance
  rerun.
- Start Workbench with an external AHO runtime home and point the managed
  project at the sandbox source root.
- Continue the real UI/action path through validation, audit, result review,
  human apply, and close/archive, or record the remaining blocker.
- Worktree isolation is not dependency isolation. Validation needs an explicit
  dependency resolution bridge or a clear fail-closed dependency blocker.

## Extension: Codex Project Trust Detection And Confirmed Write

The real UI rerun surfaced a Codex desktop warning that project-local
`.codex/config.toml`, hooks, and exec policies are ignored until the selected
project path is trusted in the user's Codex config. This belongs to the same
acceptance because it directly affects whether the current project can launch
real Codex with its project-local runtime configuration.

Execution approach:

- Add an owned Codex trust helper that reads the effective Codex config path
  from `CODEX_HOME` or the user's home `.codex/config.toml`.
- Project status should report the selected project's trust state and the exact
  config path/key that would be used.
- Add one explicit server endpoint that requires a registered project and
  `confirm: true` before writing the trusted project entry.
- The endpoint may create or update only the selected project's
  `[projects.'...']` trust entry. It must not alter startup behavior, mutate
  unrelated project entries, or grant broader Codex permissions.
- Surface the state in the Workbench project details panel as a project-level
  setup action, not as a demand confirmation gate.
- Add targeted tests for status detection, unconfirmed fail-closed behavior,
  and the scoped config write.

## Extension: External-Local Codex Memory Bridge Selection

The external sandbox rerun exposed a runtime bridge gap after Codex project
trust was confirmed: Workbench planning selected Codex app-server because it
was available, but app-server was launched with the sandbox source root as its
only readable project context. The accepted AHO Change artifacts lived under an
external AHO home, so Codex attempted to infer state from the source checkout
and produced incomplete planning evidence.

Execution approach:

- Keep Codex app-server available for repo-local and remote memory modes where
  it has the expected project context.
- In external-local memory mode, skip app-server for Workbench chat/planning and
  `code.run` until the app-server protocol has a verified additional-read-root
  bridge.
- Reuse the existing `codex exec` fallback because it already supports
  `--add-dir` for read-only memory directories.
- Pass the external memory root into workspace-write `code.run` exec argv as a
  read-only additional directory, while keeping writes scoped to the assigned
  worktree.
- Record `app-server.skipped` run events instead of claiming app-server is
  unavailable.
- Add targeted Codex argv and app-server selection tests, then rerun the
  external sandbox acceptance from a clean or freshly reset Workbench topic so
  polluted app-server planning output is not used as pass evidence.

## Extension: Existing Project Initialization Safety

The external sandbox rerun showed that current-project acceptance is invalid if
Harness setup changes the project before the demand starts. `a1` was malformed
because required Harness docs were present but not tracked into git worktrees.
`a3` was a complete clone, but external-local initialization overwrote the
existing AHO `AGENTS.md` with a generic memory map and left a backup file.

Execution approach:

- Preserve an existing non-generated project `AGENTS.md` during external-local
  initialization.
- Continue to allow AHO-generated external-local memory maps to be updated when
  they are already the project guide.
- Treat marker creation and any setup commits in external sandboxes as baseline
  preparation only, before demand execution and before source-safety evidence.
- Do not use `a1` or `a3` for final apply/close evidence. Use a fresh complete
  sandbox after this fix and record before/after `git status --short`.
- Keep the remote landing timeout fix as verification-signal repair exposed by
  real validation, not as acceptance success.
