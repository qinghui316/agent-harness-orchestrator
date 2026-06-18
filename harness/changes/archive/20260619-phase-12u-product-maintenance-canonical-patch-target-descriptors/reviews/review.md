# Review: Phase 12U Product Maintenance Canonical Patch Target Descriptors

Status: approved.

## Findings

- Pre-implementation subagent review `019edb5f-9332-75e0-b9d6-c4b0f948699f`
  returned PASS with required amendments. The plan now includes real root/symlink
  path checks, real SHA-256 hashing, optional compatibility fields,
  target-kind consistency, strict payload rules, non-authorizing readiness, and
  Workbench/no-mutation coverage.
- Post-implementation subagent review `019edb77-0e1c-7841-b3a8-be0255b96808`
  returned BLOCK. Fixed findings: docs-drift fingerprints now include patch draft
  content so old no-payload candidates do not suppress later concrete patch
  evidence; tests now cover missing file, directory target, mismatched target
  kind, unsafe `..` path rejection, and symlink escape when the environment
  permits symlink creation.
- Second post-implementation subagent review `019edb7f-3669-7672-bef0-ef8ec81e78a5`
  found no implementation blockers. Its remaining handoff-only blockers were
  fixed by changing `docs/STATUS.md` from implementation routing to close-ready
  routing and completing close/handoff drift coverage below.

## Verification

- PASS: `npm run typecheck`
- PASS: `npm run lint`
- PASS: `npm run test:fast -- tests/unit/agent-task-boundaries.test.ts`
- PASS: `npm run test:fast`
- PASS: `npx vitest run tests/unit/workbench.test.ts --testNamePattern "maintenance|canonical patch|application manifest"`
- PASS: `npm run build`
- PASS: `npm run test:integration`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- LIMITATION: full `npm run test:workbench` was attempted twice and timed out
  before returning assertions in this environment. The maintenance/canonical patch
  Workbench subset passed.

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

- Documentation entropy coverage applicable: yes, limited to required active and
  close handoff updates.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: not applicable.
- If applicable, duplicate current-state fields checked: not applicable.
- If applicable, roadmap/current-direction stale language checked: not applicable.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes, limited to preserving current
  memory-lifecycle routing without promoting archive history into handoff docs.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: not applicable.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: maintenance application manifest readiness remains
  read-only and exposes no apply/writer action.
- If applicable, tested with: `npm run test:fast -- tests/unit/agent-task-boundaries.test.ts`; `npx vitest run tests/unit/workbench.test.ts --testNamePattern "maintenance|canonical patch|application manifest"`.
- If not applicable, reason: not applicable.

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

- Proposal/runtime boundary coverage applicable: yes.
- If applicable, artifact type and authority classification: canonical patch
  proposal target descriptors and application manifest readiness are
  non-executing evidence.
- If applicable, boundary matrix checked: canonical patch proposal target
  descriptors and application manifests remain evidence only; all authority flags
  remain false.
- If applicable, out-of-scope execution paths checked: no writer/apply action was
  added; Workbench maintenance summary exposes readiness only.
- If applicable, stale/forged target behavior checked: unsafe `..` paths are
  rejected and leave manifests blocked; missing files, directories, mismatched
  target kinds, and symlink escapes are rejected by the descriptor builder; old
  artifacts without hints still parse.
- If applicable, tested with: `npm run test:fast -- tests/unit/agent-task-boundaries.test.ts`; `npx vitest run tests/unit/workbench.test.ts --testNamePattern "maintenance|canonical patch|application manifest"`.
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
- Future feature owner module: `src/agent-task/canonical-patch-targets.ts`.
- If applicable, module owners checked: `src/agent-task/canonical-patch-targets.ts`
  owns target descriptor validation and hashing.
- If applicable, moved responsibilities: descriptor validation and hashing.
- If applicable, retained facade responsibilities: patch proposal assembly remains
  in `src/agent-task/canonical-updates.ts`.
- If applicable, forbidden write-back locations: Workbench, runtime bridge,
  source, canonical docs, stable memory, and Harness files.
- If applicable, compatibility surface: optional artifact fields only.
- If applicable, behavior path tested: closeout docs drift patch draft through
  candidate, resolution, canonical update proposal, canonical patch proposal,
  application gate, and manifest.
- If applicable, follow-up split candidates: none.
- If applicable, boundary tests or lint checks: targeted agent-task lifecycle
  tests, maintenance Workbench projection subset, lint, and typecheck.
- If applicable, compatibility result: old candidate/resolution/proposal
  artifacts without target hints parse successfully and remain descriptor-less.
- If applicable, tested with: `npm run test:fast -- tests/unit/agent-task-boundaries.test.ts`; `npm run lint`; `npm run typecheck`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: checked current active path and
  Phase 12U references; `docs/STATUS.md` now routes to close/archive, not
  implementation.
- If applicable, latest archive / active path alignment: active path is Phase
  12U; latest archived product change remains Phase 12T until close/archive.
- If applicable, pending evolution state checked: `harness/evolution/pending.md`
  is absent.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
