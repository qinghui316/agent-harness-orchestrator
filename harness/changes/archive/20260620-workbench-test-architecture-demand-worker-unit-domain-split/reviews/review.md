# Review: Workbench Test Architecture Demand Worker Unit Domain Split

Status: approved.

## Findings

No blocking findings.

The moved tests remain behavior-preserving: they import the DemandWorker manager and Workbench action/snapshot APIs directly, reuse the existing Workbench fixture helpers, and do not introduce a new local framework, state machine, projection, gate, or runtime behavior.

Independent subagent close-ready review: PASS. The review confirmed the 10-test DemandWorker cluster exists only in the new suite, `test:workbench` preserves the full Workbench contract, `test:fast` avoids duplicate root coverage, no product runtime or gate/projection/state-machine logic changed, active ECL files are coherent, and `README.md` remains unrelated/untracked.

## Verification

Passed:

- `npx eslint tests\unit\workbench-demand-worker.test.ts tests\unit\workbench.test.ts tests\unit\workbench\fixtures.ts`
- `npx vitest run tests\unit\workbench-demand-worker.test.ts`
- `npx vitest run tests\unit\workbench.test.ts`
- `npm run test:workbench`
- `npm run test:fast`
- `npm run typecheck`
- `npm run lint`
- `npm run test:integration`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: future Workbench test-architecture convergence stages should be larger than this small 10-test split when the capability boundaries are already clear.
- Retries or environment failures: direct foreground `npm run test:workbench` timed out at a 10-minute tool limit; complete background `npm run test:workbench` passed with longer wait.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`, active change files.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: active handoff points to this narrow DemandWorker split and keeps later candidates as follow-up.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: no archive-ledger content promoted; historical detail remains archive-only.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\harness-evolve.ps1 check`.
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

- Module boundary coverage applicable: no.
- Future feature owner module: not applicable.
- If applicable, module owners checked: not applicable.
- If applicable, moved responsibilities: not applicable.
- If applicable, retained facade responsibilities: not applicable.
- If applicable, forbidden write-back locations: not applicable.
- If applicable, compatibility surface: not applicable.
- If applicable, behavior path tested: not applicable.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change Workbench action execution, projections, runtime services, frontend panels, typed workflow artifacts, or cross-module workflow state.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: reused `tests/unit/workbench/fixtures.ts`, existing DemandWorker manager APIs, existing Workbench action/snapshot APIs, and existing npm script staging.
- If applicable, new cross-cutting mechanism and owner: not applicable.
- If applicable, why existing mechanisms were insufficient: not applicable.
- If applicable, domain-specific logic location: DemandWorker tests are isolated in `tests/unit/workbench-demand-worker.test.ts`.
- If applicable, shared cross-cutting logic location: shared setup stays in `tests/unit/workbench/fixtures.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: no new local framework, state machine, projection, validation system, or gate was added.
- If applicable, public API / facade / Workbench compatibility result: product public APIs and Workbench behavior are unchanged; test scripts keep the full Workbench contract.
- If applicable, future-cost reduction result: future DemandWorker changes can run a targeted suite without searching the residual Workbench monolith.
- If applicable, tested with: targeted suite, residual Workbench suite, full Workbench script, fast/integration/build/lint/typecheck.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`, active change summary/spec/plan/tasks/review.
- If applicable, stale active-path / phase grep: pending final close update after archive path is known.
- If applicable, latest archive / active path alignment: pending final close update after archive path is known.
- If applicable, pending evolution state checked: `scripts\harness-evolve.ps1 check` reports no pending evolution and 4 archived changes since last completion.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
