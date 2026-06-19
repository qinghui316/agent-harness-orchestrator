# Review: maintenance-markdown-list-helper-reuse

Status: approved.

## Findings

None.

## Independent Review Notes

- Plan self-review subagent `019eddf6-6b33-7723-b9c6-f75bb5c9e10f` returned FAIL before bookkeeping edits because the close plan needed stricter close/archive and commit gate wording, explicit pending-evolution lifecycle handling, `lint-encoding.ps1` in final verification, and final `git status --short` staging review. The execution plan was revised accordingly before editing.
- Earlier close-ready subagent review returned FAIL on bookkeeping only: active `summary.md` still carried stale implementation status, T-004 was unchecked, this review still carried stale independent-review status, and `docs/STATUS.md` still instructed implementation. It explicitly found product code and boundary coverage acceptable. These bookkeeping findings were resolved by the summary, review, task, and STATUS updates before the final close-ready review.
- Close-ready subagent review `019eddf8-d13f-7433-b581-48d8329dceea` returned FAIL because the verification record said the targeted old-list grep returned no result, while the command still finds an intentionally out-of-scope manifest renderer at `src\agent-task\canonical-patch-application.ts:522`. The product code was accepted as narrow and presentation-only; this evidence mismatch is resolved by recording that only the four in-scope result/report call sites changed.
- Final close-ready subagent review `019eddfa-eff4-7003-8845-7ea012eab75f` returned PASS after the evidence correction. It reran/read the active change, handoff docs, diffs, targeted old-list grep, `harness-change.ps1 status`, `lint-ecl.ps1`, `lint-encoding.ps1`, and the targeted unit test. Residual notes: `test:workbench` remains omitted for the recorded environment/scope reason, close/archive and post-close handoff still need execution, `README.md` remains unrelated/untracked, and CRLF/LF warnings are covered by the passing encoding lint.
- Close/archive and git landing are treated as high-impact landing gates. The persistent user goal for this thread explicitly asks the agent to progress through `review, close/git` only when review is complete, handoff has no drift, and the active change is close-ready; that goal text is the human authorization source for the close/git gate in this run. Validation and review remain evidence, not authority.
- Pending Harness evolution handling remains gated: after close, run `harness-evolve.ps1 check` and inspect `harness/evolution/pending.md`. If pending appears, do not auto-apply it; either handle it through the evolution lifecycle with proposal, independent review/scoring, validation, `results.tsv`, and `mark-complete`, or record it in handoff if not started.

## Implementation Review

- `src/agent-task/maintenance-markdown.ts` now owns `renderMaintenanceMarkdownList`.
- `src/agent-task/canonical-patch-application.ts` reuses the helper for canonical patch application result `policyAuditRefs` and `artifactRefs` markdown list lines.
- `src/agent-task/canonical-patch-application-report.ts` reuses the helper for canonical patch application report `policyAuditRefs` and `artifactRefs` markdown list lines.
- The helper is presentation-only. It does not parse, validate, authorize, mutate source, change JSON/schema shape, define ledger policy, change ledger artifact refs, or affect ToolPolicyGate / human gates.
- Existing result/report markdown output is preserved: non-empty refs render as `- ${ref}` lines, empty policy audit refs render as `- none`, and empty evidence lists render no placeholder lines.

## Verification

- Targeted renderer grep for old local list rendering found one intentionally out-of-scope manifest renderer at `src\agent-task\canonical-patch-application.ts:522`; the four in-scope result/report `policyAuditRefs` and `artifactRefs` call sites now use `renderMaintenanceMarkdownList`.
- `npm run test:fast -- --run tests/unit/agent-task-boundaries.test.ts` passed: 1 file, 26 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:fast` passed: 29 files, 339 tests.
- `npm run test:integration` passed: 1 file, 38 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` passed.
- `npm run test:workbench` was not rerun for this slice. It timed out earlier in this same goal run after 184029 ms, and this change does not affect Workbench code, routes, projections, UI actions, or server behavior.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: `npm run test:workbench` was not rerun because the earlier same-goal attempt timed out after 184029 ms and left residual Node workers that had to be stopped.
- Screenshots / artifacts / run ids: not applicable.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`, active `summary.md`, active `reviews/review.md`.
- Active handoff line counts before close update: `AGENTS.md` 145, `docs/STATUS.md` 97, active `summary.md` 51, active `reviews/review.md` 157 before rewrite.
- Duplicate current-state fields checked: `AGENTS.md` and `docs/STATUS.md` both name the same active change and pending evolution `none`.
- Roadmap/current-direction stale language checked: `docs/CURRENT-DEVELOPMENT-PLAN.md` still routes future work through Architecture Growth Control and the maintenance/canonical patch chain; this change does not alter the broader roadmap.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no archive history promoted; active handoff additions are temporary current-state pointers only.
- Over-budget documents and rationale: `AGENTS.md` remains within the 120-180 target budget. `docs/STATUS.md` remains a short handoff and has not been expanded into an archive ledger.
- Tested with: handoff alignment through `scripts\harness-change.ps1 status` and ECL lint.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs, or stable-memory proposal change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/agent-task/maintenance-markdown.ts`.
- Module owners checked: presentation-only maintenance markdown list rendering belongs to the maintenance markdown owner.
- Moved responsibilities: repeated policy-audit and evidence reference-list markdown rendering moved out of canonical patch application result/report renderers.
- Retained facade responsibilities: none; `src/agent-task/manager.ts` remains untouched.
- Forbidden write-back locations: Workbench, bridge/runtime adapters, frontend, scheduler modules, Goal Loop modules, manager facades, source apply paths, schema/type definitions, ledger policy modules, and reference-project source remain untouched.
- Compatibility surface: result/report markdown list output remains unchanged; artifact JSON/schema and ledger refs remain unchanged.
- Behavior path tested: direct helper test plus existing canonical patch application result/report markdown behavior tests in `tests/unit/agent-task-boundaries.test.ts`.
- Follow-up split candidates: broader maintenance renderer adoption for proposal/gate/manifest artifact reference lists.
- Boundary tests or lint checks: `npm run test:fast -- --run tests/unit/agent-task-boundaries.test.ts`, `npm run test:fast`, `npm run typecheck`, `npm run lint`.
- Compatibility result: compatible.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- Existing mechanisms reused or strengthened: maintenance artifact markdown rendering ownership.
- New cross-cutting mechanism and owner: simple reference-list markdown rendering under `src/agent-task/maintenance-markdown.ts`.
- Why existing mechanisms were insufficient: `maintenance-artifact-store.ts` owns artifact storage/refs, not presentation line formatting; `utils.ts` would hide domain ownership.
- Domain-specific logic location: canonical patch application result/report modules keep section order, authority text, sources, guardrails, and operation rendering.
- Shared cross-cutting logic location: maintenance markdown simple list rendering lives in `src/agent-task/maintenance-markdown.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids duplicate feature-local markdown list formatting and adds no state machine, projection, validation gate, ledger policy, authority protocol, or artifact protocol.
- Public API / facade / Workbench compatibility result: manager facade and Workbench behavior unchanged; helper is imported directly from its owner module.
- Future-cost reduction result: future maintenance renderers can reuse one list helper when converging evidence/reference sections.
- Tested with: direct helper test, existing result/report tests, broad type/lint/build/unit/integration checks.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active `summary.md`.
- Stale active-path / phase grep: active handoff currently points to `maintenance-markdown-list-helper-reuse`; final close pass must replace active paths with the archived summary path.
- Latest archive / active path alignment: before close, `AGENTS.md` and `docs/STATUS.md` agree on the same active path and pending evolution `none`.
- Pending evolution state checked: `harness/evolution/pending.md` absent before phase start; final close must rerun `scripts\harness-evolve.ps1 check`.
- Final close requirement: after archive, update `AGENTS.md` and `docs/STATUS.md` to no active change, latest archive path, no pending evolution, and next Architecture Growth Control resume point.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
