# Review: Maintenance Canonical Artifact Lifecycle Reuse

Status: approved.

## Findings

Plan review: PASS from subagent `019ee1ec-76c0-7b92-b9f9-94bd39875def`.

Planning constraints to enforce during implementation:

- Existing artifacts must not be rewritten. Existing branches should only ensure the matching policy ledger entry and return the existing artifact.
- Verification should include `tests/unit/agent-task-boundaries.test.ts`, `tests/unit/workbench-module-boundaries.test.ts`, and `tests/slow/workbench-maintenance-flow.test.ts`, plus typecheck, lint, and Harness checks.

Implementation result:

- Added `src/agent-task/maintenance-artifact-lifecycle.ts` as the owner for policy-ledger-backed maintenance artifact lifecycle plumbing.
- Reused the helper from canonical update proposal/decision, canonical patch proposal/application gate, application manifest/result, and application report paths.
- Added targeted coverage proving fresh write+ledger behavior and existing-artifact no-rewrite ledger assurance.

Close-ready review: subagent `019ee1f5-6b53-7272-8e37-7221995a00e4` initially returned BLOCK only for stale close/handoff wording and incomplete `T-005`. It found no code-level Architecture Growth Control blocker. This review was updated after those close-state issues were corrected.

## Verification

Passed:

- `npx eslint src/agent-task/maintenance-artifact-lifecycle.ts src/agent-task/canonical-updates.ts src/agent-task/canonical-patch-application.ts src/agent-task/canonical-patch-application-report.ts tests/unit/agent-task-boundaries.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/unit/agent-task-boundaries.test.ts`: 33 tests passed.
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`: 37 tests passed.
- `npx vitest run tests/slow/workbench-maintenance-flow.test.ts`: 5 tests passed.
- `npm run typecheck`
- `npm run lint`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes, active handoff only.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change files.
- If applicable, before/after line counts: active-state line counts are `AGENTS.md` 146, `docs/STATUS.md` 128, `docs/CURRENT-DEVELOPMENT-PLAN.md` 74.
- If applicable, duplicate current-state fields checked: active handoff fields align between `AGENTS.md` and `docs/STATUS.md`.
- If applicable, roadmap/current-direction stale language checked: no roadmap direction change; current plan remains Architecture Growth Control.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: not applicable.
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

- Proposal/runtime boundary coverage applicable: yes, artifact lifecycle refactor only.
- If applicable, artifact type and authority classification: maintenance canonical proposal/decision/gate/manifest/result/report artifacts keep their existing authority flags and classifications.
- If applicable, boundary matrix checked: artifact lifecycle helper only composes existing store and ledger primitives; existing artifact types and authority flags stay in domain modules.
- If applicable, out-of-scope execution paths checked: no Workbench action, ToolPolicyGate, human gate, source apply, scheduler, Goal Loop, runtime, remote, or Harness evolution path changed.
- If applicable, stale/forged target behavior checked: existing maintenance flow and agent-task boundary tests still cover stale/forged maintenance targets and canonical patch application lineage.
- If applicable, tested with: targeted ESLint, agent-task boundaries, workbench module boundaries, maintenance slow flow, typecheck, and lint.
- If not applicable, reason: not applicable.

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

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/agent-task/maintenance-artifact-lifecycle.ts`.
- If applicable, module owners checked: `src/agent-task/maintenance-artifact-lifecycle.ts` owns lifecycle plumbing; canonical domain modules own artifact construction, markdown, lineage, authority, and validation.
- If applicable, moved responsibilities: maintenance artifact lifecycle write+policy-ledger plumbing only.
- If applicable, retained facade responsibilities: public manager exports remain unchanged.
- If applicable, forbidden write-back locations: Workbench action/server/frontend code, scheduler, Goal Loop, runtime, broad manager facades, schema/type authority, and human-gate code.
- If applicable, compatibility surface: existing maintenance canonical exported functions and artifact shapes.
- If applicable, behavior path tested: helper unit coverage, module boundary coverage, and maintenance slow flow.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: existing exported maintenance canonical functions and Workbench maintenance flow remain compatible.
- If applicable, tested with: targeted ESLint, `agent-task-boundaries`, `workbench-module-boundaries`, maintenance slow flow, typecheck, and lint.
- If not applicable, reason: change does not add or change Workbench action execution, projections, runtime services, frontend panels, typed workflow artifacts, or cross-module workflow state.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: `writeMaintenanceJsonMarkdownArtifact`, `ensureMaintenancePolicyLedgerEntryForStoreArtifact`, typed `MaintenanceArtifactStore`, canonical lineage/authority/target-boundary helpers.
- If applicable, new cross-cutting mechanism and owner: `src/agent-task/maintenance-artifact-lifecycle.ts` owns only artifact lifecycle plumbing.
- If applicable, why existing mechanisms were insufficient: existing primitives are reused, but repeated local composition obscures the shared lifecycle rule.
- If applicable, domain-specific logic location: current canonical update/application/report modules.
- If applicable, shared cross-cutting logic location: maintenance artifact lifecycle helper.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new local framework, state machine, projection, validation gate, or artifact family.
- If applicable, public API / facade / Workbench compatibility result: no public manager export or Workbench action payload changed.
- If applicable, future-cost reduction result: seven canonical-chain lifecycle call sites now reuse one helper rather than local private ledger/write glue.
- If applicable, tested with: targeted ESLint, `agent-task-boundaries`, `workbench-module-boundaries`, maintenance slow flow, typecheck, and lint.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`, active change files.
- If applicable, stale active-path / phase grep: active path is present only as the current active change before close.
- If applicable, latest archive / active path alignment: active handoff aligns now; post-close handoff will update archive paths after close.
- If applicable, pending evolution state checked: `scripts/harness-evolve.ps1 check` reported no pending evolution and 2 archived changes since last completion.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
