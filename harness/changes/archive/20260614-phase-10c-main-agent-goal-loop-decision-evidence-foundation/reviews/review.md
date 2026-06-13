# Review: Phase 10C Main Agent Goal Loop Decision Evidence Foundation

Status: approved

## Findings

Pre-implementation review completed with two independent subagent review rounds.

- Round 1 finding: do not reuse legacy MainOrchestratorDecision or demand-worker decision logs for GoalLoopDecision; add separate typed evidence.
- Round 1 split finding: one reviewer accepted reusing `orchestrator.evaluate`, while the code-boundary reviewer flagged that writing planning evidence from `orchestrator.evaluate` would pollute demand-worker semantics.
- Round 2 decision: use a dedicated `planning.goal-loop.evaluate` high-impact action and keep `orchestrator.evaluate` compatible as demand-worker status inspection.
- Round 2 hard requirements: active `changeId` must be stale-revalidated; recommended existing actions must include required scope ids; `executionStarted` must be schema-literal `false`.

No unresolved P0/P1 logic or boundary issue remains after implementation.

## Verification

- `npm run test -- tests/unit/goal-loop-decision.test.ts`
- `npm run test -- tests/unit/workflow-actions.test.ts`
- `npm run test -- tests/unit/workbench-module-boundaries.test.ts`
- `npm run test -- tests/unit/workbench-server.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user requested two rounds of subagent self-review before automatic execution; completed before implementation.
- Retries or environment failures: `tests/unit/workbench.test.ts` timed out twice when run alone, leaving Vitest workers; those repo-scoped test processes were cleaned up, and the later full `npm run test` passed.
- Screenshots / artifacts / run ids: subagent reviewers `019ec1bb-52ff-7af3-a0a1-d4e07706188d` and `019ec1bb-89db-7bf1-93a9-87e337e0b15b`.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: action result and confirmation/action surface only; no new lazy projection or page is planned.
- If applicable, tested with: `npm run test -- tests/unit/workbench-server.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- If applicable, checked target ids: selected `changeId`; no secondary target ids are required for this evaluation action.
- If applicable, tested action path: `npm run test -- tests/unit/workflow-actions.test.ts`; `npm run test -- tests/unit/workbench-server.test.ts`; `npm run test`.
- If applicable, duplicate action/evidence affordance check: `orchestrator.evaluate` remains demand-worker status inspection; `planning.goal-loop.evaluate` is a separate high-impact evidence-writing action.
- If not applicable, reason: not applicable.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: yes.
- If applicable, checked source project / fixture: unit GoalLoopDecision fixture plus full product test fixtures.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable; action must not create or mutate these.
- If applicable, source-root mutation gate checked: action writes only GoalLoopDecision artifacts and Workbench decision/thread evidence.
- If applicable, out-of-scope source mutation check: focused tests assert `executionStarted=false`; full product tests passed.
- If applicable, tested with: `npm run test -- tests/unit/goal-loop-decision.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: GoalLoopDecision must not start workers, runtime adapters, Codex, validation, audit, IntegrationCheck, apply, or scheduler execution.
- If applicable, tested with: `npm run test -- tests/unit/goal-loop-decision.test.ts`; `npm run test -- tests/unit/workbench-module-boundaries.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: `GoalLoopDecision.authority = non-executing-planning-evidence`.
- If applicable, boundary matrix checked: GoalLoopDecision recommends only existing scoped actions when required ids are present, otherwise waits/blocks.
- If applicable, out-of-scope execution paths checked: no worker/scheduler/IntegrationCheck/apply/close path is called from `src/goal-loop`.
- If applicable, stale/forged target behavior checked: `planning.goal-loop.evaluate` requires selected `changeId` and stale-revalidates active Change target.
- If applicable, tested with: `npm run test -- tests/unit/goal-loop-decision.test.ts`; `npm run test -- tests/unit/workflow-actions.test.ts`; `npm run test -- tests/unit/workbench-server.test.ts`; `npm run test`.
- If not applicable, reason: not applicable.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/goal-loop/`.
- If applicable, module owners checked: `src/goal-loop/` owns types/schema/paths/repository/rendering/compiler; `src/workbench/actions/handlers/goal-loop.ts` is thin handler glue.
- If applicable, moved responsibilities: new GoalLoopDecision evidence implementation belongs to `src/goal-loop/`.
- If applicable, retained facade responsibilities: `src/goal-loop/manager.ts` re-exports; Workbench handler remains thin glue.
- If applicable, forbidden write-back locations: `src/workbench/chat.ts`, `src/workbench/actions/handlers/index.ts` main logic, `src/workbench/demand-workers/orchestration.ts`, server/web/CLI facades, scheduler facades.
- If applicable, compatibility surface: `orchestrator.evaluate` remains demand-worker status inspection.
- If applicable, behavior path tested: planning-only recommendation, reserved first-worker recommendation, and existing-worker wait behavior.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`, `npm run lint`, full `npm run test`.
- If applicable, compatibility result: old `orchestrator.evaluate` behavior was not repurposed; new action is additive.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, core docs.
- If applicable, stale active-path / phase grep: no stale Phase 10B active claim found.
- If applicable, latest archive / active path alignment: active change points to Phase 10C before close.
- If applicable, Harness evolution state checked: `harness-evolve.ps1 check` reports no active evolution handoff.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
