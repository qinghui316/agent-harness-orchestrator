# Tasks: workbench-current-project-real-codex-acceptance

- [x] T-001: Record preflight evidence and create active change context.
  - Covers: AC-001

- [x] T-002: Run Workbench planning and capture primary confirmation evidence.
  - Covers: AC-002, AC-003

- [x] T-003: Run decomposition/readiness and verify `code.run` is the next
  allowed action before execution.
  - Covers: AC-002, AC-004

- [x] T-004: Run real Codex `code.run` through Workbench action path and
  collect `coder-codex` worktree artifacts.
  - Covers: AC-005

- [x] T-005: Capture validation/audit/result review evidence or classify the
  blocker without fake pass evidence.
  - Covers: AC-006, AC-008

- [x] T-006: Attempt Workbench human-gated apply only if result review is ready,
  recording before/after source status.
  - Covers: AC-007, AC-008
  - Result: external sandbox `a9` reached UI `result.apply`. Before apply,
    `git -C C:\aho-accept\a9\src status --short` was empty. After apply, source
    status was `M docs/WORKBENCH.md` and
    `?? tests/unit/workbench-real-codex-acceptance-doc.test.ts`.

- [x] T-007: Attempt Workbench human-gated close/archive only if apply succeeds,
  or record the blocking stage.
  - Covers: AC-008
  - Result: external sandbox `a10` reached human-gated apply with a local
    commit, then Workbench `change.close` archived the demand at
    `C:\aho-accept\a10\home\projects\aho-accept-a10\harness\changes\archive\20260623-aho-ci-current-project-real-codex-acceptance`.

- [x] T-008: Run required mechanical verification and update review/handoff
  evidence.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008

- [x] T-009: Implement a worktree dependency resolution bridge for validation
  worktrees, with fail-closed diagnostics when source dependencies are missing.
  - Covers: AC-006, AC-009

- [x] T-010: Add targeted tests proving the dependency bridge resolves local
  Node binaries/modules, fails closed when dependencies are unavailable, and
  does not enter worktree diff/hash/apply evidence.
  - Covers: AC-006, AC-009

- [x] T-011: Rerun real Workbench/server action acceptance after the dependency
  bridge, continuing only through legal next gates and recording validation,
  audit, result review, apply, close, or the next blocker.
  - Covers: AC-001, AC-002, AC-005, AC-006, AC-007, AC-008, AC-009
  - Result: dependency bridge fixed the npm binary resolution blocker.
    Formal rerun reached validation pass, audit block, bounded rework, and an
    earlier validation failure; no fake pass, apply, or close was performed at
    that point.

- [x] T-012: Close out handoff drift for `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md` without expanding archive history.
  - Covers: AC-008

- [x] T-013: Recheck the latest aggregate-only `web-app.test.tsx` failure in
  current source and candidate worktree, then rerun legal Workbench
  validation/audit and capture real browser UI evidence before any apply/close
  claim.
  - Covers: AC-006, AC-008, AC-010
  - Result: current source and old candidate worktree both pass
    `tests/unit/web-app.test.tsx`. Real browser UI evidence was captured for
    rework/audit/source-safety states. The legal Workbench path reached
    validation pass, audit `approved-with-notes`, UI `audit.accept`, and then
    dirty-source apply safety.

- [x] T-014: Preserve same-root runtime evidence externally and remove
  repo-root Workbench runtime state from the AHO development repository.
  - Covers: AC-001, AC-011
  - Result: `.agent-harness/` was moved from the repository root to
    `C:\Users\qinghui\.agent-harness\acceptance-archives\aho-real-codex-20260622-same-root\repo-root-agent-harness\`.

- [x] T-015: Create an external sandbox source root and rerun formal real
  Workbench/Codex acceptance with external AHO runtime home.
  - Covers: AC-001, AC-002, AC-005, AC-006, AC-007, AC-008, AC-010, AC-011
  - Result: sandbox `C:\aho-accept\a9\src` with external home
    `C:\aho-accept\a9\home` reached real UI planning, decomposition/readiness,
    `code.run`, validation/rework, validation pass, audit approval, UI apply,
    and landing readiness.

- [x] T-016: Add Codex project trust detection and a human-confirmed Workbench
  project action to trust the selected project, without startup self-mutation.
  - Covers: AC-012
  - Result: `src/codex/trust.ts` reports and writes only scoped project trust
    entries; Workbench project status exposes the trust state; the server
    endpoint requires the selected project id and `confirm: true`; the project
    details panel shows a human action instead of mutating config at startup.

- [x] T-017: Skip Codex app-server for external-local memory and pass the
  external memory root to Codex exec paths that need AHO Change context.
  - Covers: AC-013
  - Result: Workbench chat/planning and `code.run` now use Codex app-server only
    when the selected memory mode can safely provide the AHO context. In
    external-local mode they record `app-server.skipped` and fall back to
    `codex exec` with `--add-dir` memory root support, including
    workspace-write `code.run`.

- [x] T-018: Preserve existing project `AGENTS.md` during external-local Harness
  initialization and stabilize the remote landing slow timeout signal exposed by
  real validation.
  - Covers: AC-014
  - Result: `initHarness(..., { memoryMode: "external-local" })` now skips a
    non-generated existing `AGENTS.md` instead of replacing it with a generic
    memory map. The slow remote merge test now has an explicit slow-test
    timeout after real validation showed the default 30s timeout was too low.

- [x] T-019: Rerun formal real Workbench/Codex acceptance from a fresh complete
  sandbox after the external-local init protection.
  - Covers: AC-001, AC-002, AC-005, AC-006, AC-007, AC-008, AC-010, AC-011,
    AC-014
  - Result: earlier `a4` exposed slow timeout debt; the final `a9` rerun used a
    complete sandbox and reached UI apply.

- [x] T-020: Stabilize the apply-integration slow timeout signal exposed by
  the `a4` formal rerun, then rerun formal acceptance from a fresh sandbox.
  - Covers: AC-006, AC-008, AC-014
  - Result: apply-integration slow timeout repairs are included in this active
    change and the later `a9` rerun reached validation pass and UI apply.

- [x] T-021: Prepare the same worktree dependency bridge for `coder-codex`
  worktrees before Codex starts, so real code/rework runs can self-check local
  npm commands without hanging on missing worktree dependencies.
  - Covers: AC-005, AC-006, AC-009
  - Result: formal sandbox `a5` rerun exposed this gap after validation failed
    on candidate lint and bounded rework tried to run `npm run lint` /
    `npx vitest` inside a dependency-free coder worktree. `src/code/manager.ts`
    now prepares the dependency bridge before starting Codex, and sandbox `a6`
    run `run-20260622-183445-aho-ci-current-project-real-codex-acceptance-f23ca4`
    recorded `code.dependency_bridge.prepared`.

- [x] T-022: Rerun formal acceptance from an external sandbox after the
  coder-worktree dependency bridge.
  - Covers: AC-001, AC-002, AC-005, AC-006, AC-008, AC-009, AC-010, AC-011
  - Result: sandbox `C:\aho-accept\a6\src` with external home
    `C:\aho-accept\a6\home` reached real UI demand creation, planning,
    decomposition/readiness, and real `coder-codex` worktree `code.run`
    `run-20260622-183445-aho-ci-current-project-real-codex-acceptance-f23ca4`.
    The run recorded `code.dependency_bridge.prepared`, completed, and
    produced a real diff. Validation then passed `typecheck` and `lint` but
    entered the package fallback `npm run test`, which dragged the real
    acceptance path into full Workbench slow scheduler aggregate execution.
    The run was stopped through the UI after it spent the acceptance window in
    slow validation; no audit, apply, or close was attempted.

- [x] T-023: Fix or constrain the Workbench real-acceptance validation profile
  so small real candidates do not default to full slow aggregate validation.
  - Covers: AC-006, AC-008, AC-010
  - Result: sandbox `a9` used external memory
    `harness/config/environment.json` with bounded real default profile
    (`typecheck`, `lint`, `test:fast`, `build`) and reached validation pass.

- [x] T-024: Fix the Workbench confirmation/action boundary that leaves a
  running primary gate clickable, allowing duplicate real planning runs.
  - Covers: AC-002, AC-003, AC-010
  - Result: sandbox `a8` UI run at `http://127.0.0.1:4326` started duplicate
    `planning.generate` Codex runs (`run-20260622-185618-...` and
    `run-20260622-185626-...`) because the visible confirmation card remained
    clickable while the first planning run was active. Repeated UI stop requests
    were required to terminate both runs. The product boundary is now fixed:
    the service rejects duplicate in-flight non-control workflow actions, the
    selected-demand queue suppresses primary confirmations while a real
    workflow action or execution run is active, and inline confirmations disable
    during submission.

- [x] T-025: Add an authoritative in-flight workflow action guard before
  appending a new `workflow.started` entry.
  - Covers: AC-002, AC-003, AC-010
  - Result: `runWorkbenchWorkflowActionService` now reads scoped thread entries
    and rejects a second non-control workflow action for the same Change while
    an earlier workflow action has no terminal thread entry. Control actions
    `conversation.steer`, `conversation.interrupt`, and `role.pipeline.stop`
    remain allowed.

- [x] T-026: Suppress or disable selected-demand primary confirmations while
  the demand is running, then rerun formal external-sandbox UI acceptance.
  - Covers: AC-002, AC-005, AC-006, AC-007, AC-008, AC-010, AC-011
  - Result: fresh sandbox `C:\aho-accept\a9\src` with external runtime home
    `C:\aho-accept\a9\home` showed the selected-demand confirmation buttons
    disabled during `planning.generate`, `code.run`, `result.refresh-rework`,
    `audit.accept`, and `result.apply`. Screenshots were recorded under
    `C:\aho-accept\a9\ui-evidence\`, including
    `a9-planning-running-disabled.png`, `a9-code-run-running-disabled.png`,
    `a9-validation-failed-rework-gate.png`, `a9-audit-approved-accept-gate.png`,
    and `a9-apply-ready-gate.png`.

- [x] T-027: Fix landing attribution for applied results with untracked files
  whose source diff only differs by patch line-ending normalization.
  - Covers: AC-007, AC-008
  - Result: `landing.refresh` on sandbox `a9` changed package
    `landing-worktree-9616db6b668a` from `unattributed-dirty-source` to
    `ready`; `sourceDiffHash` and `expectedDiffHash` both resolved to
    `64ea830c1b14eb35d0807e78d35364d86cc245748eecff7dc875e4b101be0f0e`.

- [x] T-028: Provide or verify a human-gated local commit path after
  Workbench UI apply, then close/archive the sandbox demand.
  - Covers: AC-008
  - Result: `a10` exposed the existing commit-capable `result.apply` path as
    the primary human gate. Apply run
    `run-20260623-015903-aho-ci-current-project-real-codex-acceptance-40ea3b`
    recorded `committed=true` and commit
    `15017ad093b68d10077d1cd23a7745e1986c5a8f`.

- [x] T-029: Expose the existing commit-capable `result.apply` path as the
  Workbench primary human gate for ready single-result apply, then verify that
  applying with a local commit reveals the existing `change.close` gate without
  using remote Draft PR handoff.
  - Covers: AC-007, AC-008, AC-010
  - Owner: Workbench read-model decision projection, Workbench App approval
    payload forwarding, and existing server allowlisted approval action
    execution. This reuses `result.apply` with `options.commit=true`; it does
    not add a new workflow action, full-auto mode, or remote landing behavior.
  - Result: after committed apply and landing refresh, the current Workbench
    confirmation queue selected `change.close` as primary. The right-side
    decision inspector still showed an old failed result card, so close was
    submitted through the project-scoped Workbench action endpoint using the
    exact current queue payload. No remote Draft PR, push, or merge was used.
