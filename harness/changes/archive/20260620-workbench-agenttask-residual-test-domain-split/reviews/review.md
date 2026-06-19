# Review: Workbench AgentTask Residual Test Domain Split

Status: approved.

## Findings

Plan review: PASS from subagent `019ee1db-f2c0-75a2-aeda-5c9a5734b81e` after earlier BLOCK findings were incorporated. Required plan changes added `docs/DEVELOPMENT.md`, stronger package script contract checks, explicit `docs/STATUS.md`/`AGENTS.md` final handoff updates, and `docs/CURRENT-DEVELOPMENT-PLAN.md` stale current-plan cleanup.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-agent-task-domain.test.ts`: 4 tests passed.
- Package script contract check: old residual path absent, new suite excluded from `test:fast`, new suite included exactly once in `test:workbench` at the old residual position, all `test:workbench` `vitest run tests/...` targets exist, and no empty `&&` segment exists.
- Deleted-file check: `tests/unit/workbench.test.ts` absent.
- `npx eslint tests/unit/workbench-agent-task-domain.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`: 29 files, 346 tests passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- Current-doc drift check in active close-ready state: no current docs instruct agents to move coverage out of the deleted residual suite; active handoff only instructs close/archive.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: residual `tests/unit/workbench.test.ts` removed; future Workbench coverage should choose explicit capability suites.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, and `docs/DEVELOPMENT.md` in active close-ready state.
- If applicable, before/after line counts: active-state line counts are `AGENTS.md` 101, `docs/STATUS.md` 104, `docs/CURRENT-DEVELOPMENT-PLAN.md` 53, `docs/DEVELOPMENT.md` 355.
- If applicable, duplicate current-state fields checked: active handoff fields align between `AGENTS.md` and `docs/STATUS.md`; post-close handoff will update archive paths after close.
- If applicable, roadmap/current-direction stale language checked: `docs/CURRENT-DEVELOPMENT-PLAN.md` and `docs/DEVELOPMENT.md` were updated to remove current instructions to split the residual monolith.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: no archive narrative should be promoted; only current routing and test-strategy wording should change.
- If applicable, over-budget documents and rationale: none observed in active-state line counts.
- If applicable, tested with: active-state docs drift grep and Harness checks.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs, or handoff change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: no.
- If applicable, checked scope: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect derived read models, approval inboxes, thread/run projections, role summaries, or Harness gap reports.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: no.
- If applicable, checked boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect external executors, Codex bridge integration, SQLite stores, Topic sessions, prompt stack composition, AHO-managed skills, or runtime projections.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes, test-topology-only.
- Future feature owner module: `tests/unit/workbench-agent-task-domain.test.ts` for Workbench AgentTask/delegation surface coverage.
- If applicable, module owners checked: `tests/unit/workbench-agent-task-domain.test.ts` owns Workbench AgentTask/delegation surface coverage; core `tests/unit/agent-task-boundaries.test.ts` remains core AgentTask/maintenance boundary coverage.
- If applicable, moved responsibilities: final residual Workbench AgentTask/delegation/boundary tests moved into the new owner suite.
- If applicable, retained facade responsibilities: not applicable; no product facade changed.
- If applicable, forbidden write-back locations: product Workbench/AgentTask source files remain untouched.
- If applicable, compatibility surface: package scripts and targeted suite coverage remain compatible.
- If applicable, behavior path tested: new suite passed.
- If applicable, follow-up split candidates: none for residual `workbench.test.ts`.
- If applicable, boundary tests or lint checks: Vitest, package contract check, and ESLint passed.
- If applicable, compatibility result: passed for test topology; no product source changed.
- If applicable, tested with: targeted suite, package contract, deleted-file check, ESLint, typecheck, lint, and `test:fast`.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: existing Vitest suite structure, shared Workbench fixture, package script contracts, Documentation Entropy, and current-plan handoff.
- If applicable, new cross-cutting mechanism and owner: none.
- If applicable, why existing mechanisms were insufficient: existing mechanisms are sufficient.
- If applicable, domain-specific logic location: Workbench AgentTask/delegation surface assertions in explicit capability suite.
- If applicable, shared cross-cutting logic location: existing Workbench fixtures and package scripts.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new fixture framework or validation/gate protocol.
- If applicable, public API / facade / Workbench compatibility result: passed; no product source changed.
- If applicable, future-cost reduction result: residual Workbench monolith removed; future Workbench tests must pick explicit owners.
- If applicable, tested with: targeted suite, package contract, docs updates, typecheck, lint, and `test:fast`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, `docs/DEVELOPMENT.md`, active summary, and archive path after close.
- If applicable, stale active-path / phase grep: active path is present only as the current active change before close.
- If applicable, latest archive / active path alignment: active handoff aligns now; post-close handoff will update archive paths after close.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check` reported no pending evolution and 1 archived change since last completion.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
