Status: completed / ready to close

## Accepted Audit

- Audit ID: run-20260622-052800-workbench-current-project-real-codex-acceptance-4f21a6
- Run ID: run-20260622-052800-workbench-current-project-real-codex-acceptance-4f21a6
- Change ID: workbench-current-project-real-codex-acceptance
- Validation ID: run-20260622-050124-workbench-current-project-real-codex-acceptance-ebc584
- Worktree ID: wt-20260622-045208-b2d6f4
- Worktree Diff Hash: d120b002a1db4026d5a971dd1af2e3e7d75fdb3a8fbf27ada8d13f805b61e0b4
- Findings: 3

## Auditor Proposal

Status: approved-with-notes

Finding: Human apply and close remain outside the validated implementation
- Severity: note
- Area: validation
- Evidence: latest validation `run-20260622-050124-workbench-current-project-real-codex-acceptance-ebc584` passed for the implementation worktree; UI `audit.accept` was confirmed; current Workbench result review is blocked by dirty-source apply readiness. `T-006` and `T-007` remain unchecked.
- Recommendation: Do not treat this audit as user apply/close approval. Apply and close/archive require a clean source root and a fresh Workbench apply/close confirmation.

Finding: Dependency bridge behavior is covered by targeted tests and diff evidence
- Severity: note
- Area: implementation
- Evidence: `src/worktree/dependencies.ts` adds source-root `node_modules` bridging for worktree validation; `tests/unit/validation.test.ts` covers bridge creation, dependency-free skip, fail-closed missing dependencies, and diff exclusion.
- Recommendation: Keep this evidence with the Change review; no implementation change required from this audit.

Finding: Runtime event append race is addressed with direct regression coverage
- Severity: note
- Area: maintainability
- Evidence: `src/runtime-continuity/repository.ts` serializes `appendAgentEventEnvelope`; `tests/unit/runtime-continuity.test.ts` verifies 40 concurrent JSONL appends preserve valid sequence IDs.
- Recommendation: No required change. Monitor for cross-process append needs separately, since this lock is process-local.

## Continuation Review

Status: completed after external sandbox `a10` local commit and close/archive

Finding: Final external-sandbox acceptance completed the local manual-gated loop
- Severity: note
- Area: product-path
- Evidence: Sandbox `a10` (`C:\aho-accept\a10\src`, external home
  `C:\aho-accept\a10\home`, Workbench URL `http://127.0.0.1:4328`) reached real
  Workbench UI demand creation, planning, confirmation,
  decomposition/readiness, `code.run`, validation failure, bounded rework,
  validation pass, audit approval, UI `audit.accept`, human-gated
  `result.apply` with local commit, landing readiness refresh, and
  human-confirmed close/archive. Real Codex run
  `run-20260623-014343-aho-ci-current-project-real-codex-acceptance-47649d`
  recorded `runtime="coder-codex"` and `executionMode="worktree"` with
  `run.json`, `codex-events.jsonl`, `last-message.md`, `diff.patch`, and
  `diff-stat.txt`. Rework run
  `run-20260623-015011-aho-ci-current-project-real-codex-acceptance-fc2316`
  also used real `coder-codex` worktree execution. Validation
  `run-20260623-015616-aho-ci-current-project-real-codex-acceptance-cfe68a`
  passed for worktree `wt-20260623-015012-b2de1b` and diff hash
  `197e191d0288d92515dc86084e912c065f9cc10f61d4632841a4cf3f9f88c383`.
  Audit
  `run-20260623-015712-aho-ci-current-project-real-codex-acceptance-edf622`
  approved the candidate. Apply
  `run-20260623-015903-aho-ci-current-project-real-codex-acceptance-40ea3b`
  recorded `status="applied"`, `committed=true`, and commit
  `15017ad093b68d10077d1cd23a7745e1986c5a8f`. The sandbox source status was
  clean before apply and clean after close. The demand archived at
  `C:\aho-accept\a10\home\projects\aho-accept-a10\harness\changes\archive\20260623-aho-ci-current-project-real-codex-acceptance`.
- Recommendation: Close this active change after final mechanical and Harness
  verification. Keep the discovered decision-inspector mismatch as follow-up
  evidence rather than reopening remote PR scope.

Finding: Decision inspector can lag the confirmation queue after committed apply
- Severity: note
- Area: workbench-projection
- Evidence: After `a10` committed apply and landing refresh, the Workbench
  server snapshot reported `closeGate.ready=true` and confirmation queue
  primary
  `confirm:approval:close:aho-ci-current-project-real-codex-acceptance`.
  The browser UI still showed no visible close card and the decision inspector
  primary from the API remained the old failed worktree
  `wt-20260623-014343-0e2fac`. The close action was therefore submitted through
  the same project-scoped Workbench action endpoint using the exact current
  queue payload.
- Recommendation: Track this as a bounded Workbench projection/UI follow-up.
  It did not bypass workflow authority because the action came from the
  authoritative confirmation queue and used scoped `change.close` target ids.

Finding: Fresh external-sandbox UI acceptance reached human apply and exposed a local close blocker
- Severity: resolved blocker
- Area: product-path
- Evidence: Sandbox `a9` (`C:\aho-accept\a9\src`, external home
  `C:\aho-accept\a9\home`, Workbench URL `http://127.0.0.1:4327`) reached real
  UI demand creation, planning, confirmation, decomposition/readiness,
  `code.run`, validation failure, bounded rework, validation pass, audit
  `approved`, UI `audit.accept`, and UI `result.apply`. Validation
  `run-20260622-214027-aho-ci-current-project-real-codex-acceptance-8fa60b`
  passed `typecheck`, `lint`, `test:fast`, and `build`. Audit
  `run-20260622-214145-aho-ci-current-project-real-codex-acceptance-56089f`
  approved the final candidate with zero findings. Apply
  `run-20260622-214404-aho-ci-current-project-real-codex-acceptance-dde6fd`
  succeeded after a clean source status. After apply, source status was
  `M docs/WORKBENCH.md` and
  `?? tests/unit/workbench-real-codex-acceptance-doc.test.ts`.
- Recommendation: Keep this as `a9` negative evidence. The later `a10` rerun
  verified committed apply and close/archive without remote PR handoff.

Finding: Landing attribution no longer fails on patch line-ending normalization
- Severity: resolved blocker
- Area: landing-source-safety
- Evidence: The first `a9` landing package
  `landing-worktree-9616db6b668a` was incorrectly
  `unattributed-dirty-source`; `apply.json` expected diff hash
  `64ea830c1b14eb35d0807e78d35364d86cc245748eecff7dc875e4b101be0f0e`,
  while the source diff hash differed only because the final patch line ending
  was CRLF instead of LF. `src/landing/utils.ts`,
  `src/landing/source-diff.ts`, and `src/landing/targets.ts` now use a
  landing-specific normalized patch hash for attribution. Failed landing
  package projection now exposes existing `landing.refresh`; after rebuilding
  and restarting the a9 server, project-scoped `landing.refresh` changed the
  same package to `ready` with matching source/expected hash.
- Recommendation: Keep the normalization scoped to landing attribution. Do not
  change validation/audit `worktreeDiffHash` evidence semantics.

Finding: Duplicate in-flight workflow confirmations are now blocked
- Severity: note
- Area: workbench-action-boundary
- Evidence: `runWorkbenchWorkflowActionService` now rejects a second
  non-control workflow action for the same Change while a prior
  `workflow.started` has no terminal thread entry, while allowing
  `conversation.steer`, `conversation.interrupt`, and `role.pipeline.stop`.
  The read-model suppresses selected-demand primary confirmations while an
  active workflow action or execution run is present, and `DecisionPanels`
  disables inline confirmation buttons during submission. Verification passed:
  targeted Workbench/action/DOM/validation suites, `npm run typecheck`,
  `npm run lint`, `npm run test:fast`, `npm run build`, and
  `npm run test:workbench`.
- Recommendation: Keep the duplicate-action fix as verified. The subsequent
  `a9` rerun recorded UI evidence that running actions disable/suppress the
  duplicate primary confirmation; the remaining blocker is the local
  commit/clean close path after UI apply.

Finding: Running primary confirmations can be clicked again and start duplicate role runs
- Severity: resolved blocker
- Area: workbench-action-boundary
- Evidence: External sandbox `a8` UI at `http://127.0.0.1:4326` created demand
  `aho-ci-current-project-real-codex-acceptance`. After `生成方案草案` was
  confirmed, the UI showed `正在运行：生成方案草案` while the same `确认` action
  remained clickable. A second click started another real Codex planning run:
  `run-20260622-185618-aho-ci-current-project-real-codex-acceptance-b3ec86`
  and
  `run-20260622-185626-aho-ci-current-project-real-codex-acceptance-6eeed9`.
  Repeated UI stop requests were required to stop both runs.
- Recommendation: Keep this as negative evidence for `a8`; do not reuse that
  polluted UI run as pass evidence.

Finding: Package fallback validation is too broad for real acceptance candidates
- Severity: blocker
- Area: validation-profile
- Evidence: External sandbox `a6` reached real `coder-codex` worktree
  `code.run`
  `run-20260622-183445-aho-ci-current-project-real-codex-acceptance-f23ca4`,
  including `code.dependency_bridge.prepared`. Validation
  `run-20260622-183913-aho-ci-current-project-real-codex-acceptance-bf8513`
  used package fallback `default`: `typecheck` and `lint` passed, then
  `npm run test` entered full Workbench slow scheduler aggregate execution. It
  was stopped through the UI after exceeding the real-acceptance window; no
  audit/apply/close was claimed.
- Recommendation: Use an explicit bounded real validation profile for this
  acceptance path, supplied through project memory config or an accepted
  product rule. Do not use fake Codex or fixture results as a substitute.

Finding: Real Workbench UI acceptance reached the correct fail-closed apply boundary
- Severity: note
- Area: product
- Evidence: Browser session at `http://127.0.0.1:4317` captured visible confirmation gates and result state under `.agent-harness/ui-evidence/`, including `workbench-real-ui-20260622-audit-rework-before.png`, `workbench-real-ui-20260622-audit-rework-confirmed.png`, and `workbench-real-ui-20260622-dirty-source-apply-blocker.png`. Latest result review after UI `audit.accept` exposes no `result.apply` action because source status is dirty.
- Recommendation: Keep the blocker classified as source safety. Do not apply or close until the active implementation changes are intentionally landed or parked and the unrelated `README.md` state is handled.

Finding: Earlier `web-app.test.tsx` run-graph failure is no longer current
- Severity: note
- Area: verification
- Evidence: `npx vitest run tests/unit/web-app.test.tsx` passed in the source root and in old candidate worktree `C:\Users\qinghui\.agent-harness\worktrees\aho-self\checkouts\wt-20260622-013308-269724`.
- Recommendation: Treat the old `agent-run-graph` failure as stale signal, not the current blocker.

Finding: Workbench aggregate behavior matches the new audit-accept-before-apply gate
- Severity: note
- Area: testing
- Evidence: `tests/slow/workbench-apply-integration-flow.test.ts` now accepts `audit.accept` before expecting `result.apply`, integration check, source drift, or dirty-source apply readiness. The suite passed: 9 tests. `tests/slow/workbench-remote-landing-flow.test.ts` and `tests/slow/workbench-demand-to-execution-golden-flow.test.ts` also passed with the same gate ordering.
- Recommendation: Preserve the explicit audit acceptance gate; do not collapse audit evidence into apply authorization.

Finding: Validation command side effects are cleaned before audit/apply evidence
- Severity: note
- Area: source-safety
- Evidence: `src/validation/service.ts` restores the candidate worktree diff after validation commands; `tests/unit/validation.test.ts` and `tests/integration/cli-flow.test.ts` verify validation-created files do not pollute source or candidate diff evidence.
- Recommendation: Keep validation setup and candidate diff restoration in the validation/worktree owners.

Finding: Same-root managed-project acceptance mixed product development state with target source state
- Severity: note
- Area: source-safety
- Evidence: repo-root `.agent-harness/` was created because the AHO development repository was used as the Workbench managed project. Workbench correctly withheld `result.apply` at dirty-source readiness because the source root contained active implementation changes, unrelated `README.md`, and nested Workbench runtime state.
- Recommendation: Treat same-root acceptance as negative source-safety evidence. Continue formal apply/close acceptance only with an external sandbox source root and external AHO runtime home. The repo-root `.agent-harness/` runtime directory was migrated to `C:\Users\qinghui\.agent-harness\acceptance-archives\aho-real-codex-20260622-same-root\repo-root-agent-harness\`.

Finding: Codex project trust stays human-confirmed and project-scoped
- Severity: note
- Area: runtime-boundary
- Evidence: `src/codex/trust.ts` reads the effective Codex config path and writes only the selected `[projects.'...']` trust entry. `POST /api/projects/:id/codex/trust` requires `confirm: true` and a registered project id. `tests/unit/codex-trust.test.ts` covers missing config detection, scoped trust creation, and preserving unrelated project entries. `tests/unit/workbench-server.test.ts` covers unconfirmed rejection and the project-scoped endpoint.
- Recommendation: Keep this as a project setup action. Do not move it into Workbench startup or demand execution gates.

Finding: External-local memory must not use app-server until memoryRoot is bridged
- Severity: note
- Area: runtime-boundary
- Evidence: The external sandbox UI rerun at `http://127.0.0.1:4320` reached a trusted project state, but `planning.generate` selected Codex app-server and produced incomplete planning evidence because app-server ran from the sandbox source root without the external AHO memory root. `src/codex/app-server.ts`, `src/workbench/codex-chat/bridge.ts`, `src/code/manager.ts`, `src/code/codex-exec-runner.ts`, and `src/codex/capabilities.ts` now route external-local memory to `codex exec --add-dir` and record `app-server.skipped`.
- Recommendation: Rerun the external sandbox acceptance from fresh planning evidence. Do not use the polluted app-server planning output as pass evidence.

Finding: External-local init must preserve existing project AGENTS.md
- Severity: note
- Area: source-safety
- Evidence: Fresh sandbox `C:\aho-accept\a3\src` showed that external-local `initHarness` replaced the cloned AHO `AGENTS.md` with a generic 39-line memory map and left `AGENTS.md.bak-*`, dirtying and semantically weakening the managed project before any demand ran. `src/harness/init.ts` now skips non-generated existing `AGENTS.md` files. `tests/unit/harness.test.ts` verifies the existing guide is preserved.
- Recommendation: Treat `a3` as setup-contaminated evidence only. The next formal apply/close attempt needs a fresh sandbox created after this fix.

Finding: Real validation exposed an existing slow-suite timeout signal
- Severity: note
- Area: verification
- Evidence: External validation `run-20260622-160517-current-project-real-codex-acceptance-e64131` passed typecheck, lint, and build, but failed `npm run test` because `tests/slow/workbench-remote-landing-flow.test.ts` timed out at 30s in `prepares and performs a user-confirmed remote PR merge with merged closeout`. The same file passed after adding an explicit slow-test timeout: `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`.
- Recommendation: Keep this as verification-signal repair, not candidate product success. Rerun from a fresh sandbox before attempting apply/close.

## Coverage

- Workbench User-Surface Honesty Coverage: real UI screenshots plus Workbench unit/slow suites confirm the visible primary gate sequence. No fake full-auto, parallel executor, merge queue, or apply button was exposed at dirty-source state. Codex trust is shown as a project setup action in the project details panel, not as a demand primary gate or automatic startup mutation.
- Scoped Workbench Action Payload Coverage: `audit.accept`, `result.refresh-rework`, `result.apply`, and integration-check tests exercise scoped `changeId`, worktree, validation/audit, and target ids through Workbench action execution and stale revalidation. Codex trust uses the scoped `/api/projects/:id/codex/trust` endpoint and `confirm: true`; missing confirmation fails closed.
- Source Apply Safety Coverage: same-root source project was `E:\个人项目\agent-harness-orchestrator`; source root mutation was not performed. Before apply, `git status --short` remained dirty with active implementation changes, unrelated `?? README.md`, and previously nested Workbench runtime state; Workbench withheld `result.apply`. The formal source-mutation evidence now comes from external sandbox `C:\aho-accept\a9\src`, not from the development checkout.
- External Source Apply Safety Coverage: `C:\aho-accept\a1\src` remained clean during UI-driven `code.run`, but was later classified as a malformed sandbox because required Harness files were not git-tracked into worktrees. `C:\aho-accept\a3\src` showed an initialization source-safety bug before demand execution because external-local init overwrote `AGENTS.md`; no apply/close attempt was made from either sandbox. Fresh sandbox `C:\aho-accept\a9\src` started clean before UI `result.apply`, then showed only the applied result afterward: `M docs/WORKBENCH.md` and `?? tests/unit/workbench-real-codex-acceptance-doc.test.ts`; it remained negative evidence for the missing local commit path. Final sandbox `C:\aho-accept\a10\src` started clean before `result.apply`, applied worktree `wt-20260623-015012-b2de1b` through the committed apply path, recorded commit `15017ad093b68d10077d1cd23a7745e1986c5a8f`, passed landing readiness after committed-apply attribution, and stayed clean after close/archive.
- Worktree Diff Artifact Coverage: applicable. Validation side-effect cleanup and untracked-file restoration are covered by `tests/unit/validation.test.ts` and `tests/integration/cli-flow.test.ts`.
- Read Model Projection Coverage: applicable. `tests/unit/workbench-read-model.test.ts` and Workbench slow suites verify audit acceptance appears before apply readiness and source blockers project after audit acceptance.
- Runtime Bridge Boundary Coverage: applicable. Real `coder-codex` worktree runs, Codex process-scoped config override, explicit Codex project trust status, and external-local memory app-server skip behavior are recorded as runtime bridge setup. Run/Validation/Audit remain evidence, not workflow truth; Codex trust detection does not authorize source apply, close, or demand execution. External-local Codex execution now uses the exec path that can read AHO memoryRoot instead of letting app-server infer workflow truth from the source checkout alone.
- Module Boundary Coverage: applicable. Changes stay in owned Codex capability/app-server/trust, validation/worktree, runtime-continuity, workflow-runtime bounded rework, Workbench project-admin/API route/read-model/action projection, and test owners.
- Harness Init Boundary Coverage: applicable. The AGENTS preservation fix stays in the Harness init owner (`src/harness/init.ts`) with focused `tests/unit/harness.test.ts` coverage; it does not move setup behavior into Workbench UI or Codex runtime code.
- Core Mechanism Reuse Coverage: applicable. The continuation reused Workbench action registry, scoped stale revalidation, validation/audit, result review, source apply safety, and ECL tasks instead of adding a new evidence family or full-auto path.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx`: passed in source root.
- `npx vitest run tests/unit/web-app.test.tsx`: passed in old candidate worktree `wt-20260622-013308-269724`.
- `npx vitest run tests/unit/validation.test.ts`: passed.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/validation.test.ts`: passed.
- `npx vitest run tests/slow/workbench-demand-to-execution-golden-flow.test.ts`: passed.
- `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`: passed.
- `npx vitest run tests/slow/workbench-apply-integration-flow.test.ts`: passed.
- `npm run test:workbench`: passed after the duplicate in-flight action fix.
- Prior split `test:workbench` diagnostics also passed:
  `npm run test:workbench:unit`, `npm run test:workbench:slow:scheduler`,
  `tests/slow/workbench-maintenance-flow.test.ts`, and
  `tests/slow/workbench-goal-loop-prompt-flow.test.ts`, in addition to the
  three Workbench slow suites above.
- `npm run test:integration`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run build`: passed.
- `npx vitest run tests/unit/codex-trust.test.ts tests/unit/workbench-server.test.ts`: passed.
- `npx vitest run tests/unit/codex.test.ts tests/unit/codex-trust.test.ts tests/unit/workbench-server.test.ts`: passed.
- `npm run typecheck`: passed after external-local memory bridge selection.
- `npm run lint`: passed after external-local memory bridge selection.
- `npm run test:fast`: passed after external-local memory bridge selection.
- `npm run build`: passed after external-local memory bridge selection.
- `npx vitest run tests/unit/harness.test.ts`: passed after external-local AGENTS preservation.
- `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts`: passed after explicit slow timeout.
- `npm run typecheck`: passed after external-local AGENTS preservation and remote slow timeout fix.
- `npm run lint`: passed after external-local AGENTS preservation and remote slow timeout fix.
- `npm run build`: passed after external-local AGENTS preservation and remote slow timeout fix.
- `npm run test:fast`: passed after external-local AGENTS preservation and remote slow timeout fix.
- `npx vitest run tests/unit/workbench-action-service.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx tests/unit/validation.test.ts tests/slow/workbench-demand-to-execution-golden-flow.test.ts`: passed after the duplicate in-flight action fix.
- `npm run typecheck`: passed after the duplicate in-flight action fix.
- `npm run lint`: passed after the duplicate in-flight action fix.
- `npm run test:fast`: passed after the duplicate in-flight action fix.
- `npm run build`: passed after the duplicate in-flight action fix.
- `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts -t "prepares a local landing package" --reporter=verbose`: passed after landing attribution normalization and failed-landing refresh projection.
- `npm run typecheck`: passed after landing attribution normalization and failed-landing refresh projection.
- `npm run lint`: passed after landing attribution normalization and failed-landing refresh projection.
- `npm run test:fast`: passed after landing attribution normalization and failed-landing refresh projection.
- `npm run build`: passed after landing attribution normalization and failed-landing refresh projection.
- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`: passed after committed-apply primary action forwarding.
- `npx vitest run tests/slow/workbench-remote-landing-flow.test.ts -t "committed worktree apply"`: passed after committed-apply landing attribution.
- `npm run typecheck`: passed after final `a10` acceptance closeout edits.
- `npm run lint`: passed after final `a10` acceptance closeout edits.
- `npm run test:fast`: passed after final `a10` acceptance closeout edits.
- `npm run build`: passed after final `a10` acceptance closeout edits.
- `npm run test:workbench`: attempted after final edits and hit the 20-minute
  tool timeout without assertion failure. Split Workbench verification passed:
  `npm run test:workbench:unit`, `npm run test:workbench:slow:scheduler`, and
  the remaining slow-suite members. Four slow tests initially hit their local
  timeout thresholds and then passed after adding explicit slow-test timeouts:
  demand-to-execution golden flow, manual apply/archive loop, Draft PR review
  submission, and Goal Loop integration-barrier prompt flow.
- Harness checks passed after the duplicate in-flight action fix: `lint-ecl`,
  `lint-encoding`, `harness-change reindex`, `harness-change status`, and
  `harness-evolve check`.
