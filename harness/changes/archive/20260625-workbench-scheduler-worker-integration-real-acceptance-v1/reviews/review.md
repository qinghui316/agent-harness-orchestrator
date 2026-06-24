# Review: workbench-scheduler-worker-integration-real-acceptance-v1

Status: completed.

## Findings

- No unresolved findings.
- Real acceptance exposed one product path bug: scheduler worker audit/rework
  was over-scoped to sibling TaskGraph source scopes. The fix is in the
  scheduler-runtime owner and keeps worker coder/audit/rework prompts and rework
  diff checks scoped to the current scheduler reservation source scope.
- The formal rerun reached two real scheduler workers, worker validation/audit,
  and a ready integration candidate, then stopped at the
  `planning.scheduler.integration-check.run` human-confirmed gate as intended.

## Verification

- Selected verification scope: scheduler worker scope helper, scheduler worker
  runtime/rework slow paths, Workbench unit aggregate, and standard product
  checks because this change touched scheduler-runtime behavior.
- Passed: `npx vitest run tests/unit/scheduler-worker-scope.test.ts`.
- Passed: `npx vitest run tests/unit/workbench-module-boundaries.test.ts`.
- Passed: `npx vitest run tests/slow/workbench-scheduler-worker-rework-flow.test.ts`.
- Passed: `npx vitest run tests/unit/scheduler-worker-scope.test.ts tests/slow/workbench-scheduler-worker-runtime.test.ts`.
- Passed: `npm run typecheck`.
- Passed: `npm run lint`.
- Passed: `npm run test:fast`.
- Passed: `npm run build`.
- Passed: `npm run test:workbench`.

## Acceptance Feedback

- Real/manual acceptance: Workbench browser UI at `http://127.0.0.1:4336/`
  opened external project `scheduler-worker-v1b`, created the ordinary demand,
  confirmed planning/decomposition/readiness manually, selected
  `完全访问权限` once, and observed the run stop at the IntegrationCheck primary
  gate.
- Real Codex evidence: worker runs
  `run-20260625-020328-src-alpha-ts-src-beta-ts-alphalabel-betalab-5e1b4d` and
  `run-20260625-020621-src-alpha-ts-src-beta-ts-alphalabel-betalab-855dce`
  contain `run.json`, `codex-events.jsonl`, `last-message.md`, `diff.patch`,
  and `diff-stat.txt` under
  `E:\aho-accept\scheduler-worker-v1b\home\projects\scheduler-worker-v1b\runs`.
- Fake Codex / mocked PATH / fixture result exclusion: no fake Codex binary,
  mocked PATH, fixture result, or hand-written run artifact was used for the
  acceptance pass.
- External source/state safety: `E:\aho-accept\scheduler-worker-v1b\src` stayed
  clean (`git status --short` empty). AHO wrote only runtime home/worktree
  evidence; no automatic source apply/close/merge occurred.

## Worktree Diff Artifact Coverage

- Applicability: yes; scheduler worker produced worktree diffs.
- Result: covered by real Codex worktree diffs and targeted tests. The
  integration candidate records two ready worktrees with diff hashes
  `59a98c524b05808993d57ece27035b71564050ca8ddbc53cfaf5fb8f6c67fa12` and
  `4238bf6c3f6a21204f483a00b7d89e38ece62566e2e7da1ce62bbdfd1782a7fd`.

## Read Model Projection Coverage

- Applicability: yes because acceptance relies on visible confirmation queue.
- Result: Workbench snapshot after automation shows no running automation,
  primary gate `planning.scheduler.integration-check.run`, and evidence
  attached to `scheduler-integration-candidate-7fe358fd`.

## Workbench User-Surface Honesty Coverage

- Applicability: yes.
- Result: visible primary gates used implemented workflow paths only. The UI
  did not advertise full parallel executor, auto apply/close/merge, remote
  landing, or Harness evolution. `完全访问权限` did not duplicate the running gate
  and returned to a real IntegrationCheck gate after bounded automation.

## Scoped Workbench Action Payload Coverage

- Applicability: yes for real UI action payload scope.
- Result: controlled scheduler and scoped automation actions carried explicit
  `changeId`, scheduler run/reservation/candidate ids, Goal Loop packet,
  controller, preflight ids, worktree ids, and `maxSteps`; raw scheduler worker
  actions were not directly added to the automation allowlist.

## Source Apply Safety Coverage

- Applicability: yes because scheduler worker/integration output is
  source-apply-adjacent evidence.
- Result: external source was
  `E:\aho-accept\scheduler-worker-v1b\src`; runtime home was
  `E:\aho-accept\scheduler-worker-v1b\home`; source `git status --short`
  stayed empty before and after. Dirty worker worktrees are expected
  source-apply candidates and do not mutate the source root before human apply.

## Runtime Bridge Boundary Coverage

- Applicability: yes for real Codex and Workbench runtime bridge.
- Result: workflow truth remained in Harness artifacts, run artifacts,
  validation/audit records, scheduler runtime evidence, and Workbench
  projections derived from those records. Codex sessions and Workbench UI state
  did not become authority.

## Proposal / Runtime Boundary Coverage

- Applicability: yes for planning/readiness/scheduler evidence.
- Result: decomposition/readiness and Goal Loop packet/controller/preflight
  remained evidence/readiness artifacts. They enabled a bounded controlled path
  only through current-gate revalidation and did not directly execute raw
  scheduler actions.

## Goal Loop Boundary Coverage

- Applicability: yes for Goal Loop preparation and controlled scheduler entry.
- Result: `完全访问权限` used Goal Loop preparation and
  `planning.goal-loop.controlled-continue.run`; raw `planning.scheduler.*`
  actions remained outside scoped automation allowlist.

## Module Boundary Coverage

- Applicability: yes because product code changed.
- Result: new logic is isolated in `src/scheduler-runtime/worker-scope.ts` and
  consumed by scheduler worker start/audit/rework owners. No main logic was
  added to Workbench/server/App facades. Covered by
  `tests/unit/scheduler-worker-scope.test.ts` and scheduler slow paths.

## Core Mechanism Reuse Coverage

- Applicability: yes.
- Result: reused scheduler reservation source scopes, existing worker
  start/audit/rework handlers, existing worktree diff collection, existing
  current-gate revalidation, scoped automation, Goal Loop controlled
  continuation, validation/audit, and integration candidate mechanisms. No
  second scheduler runtime, permission system, projection system, or evidence
  family was added.

## Documentation Entropy Coverage

- Applicability: yes at close.
- Result: checked `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`. Handoff docs now point to this archive as
  latest scheduler worker/integration acceptance and keep detailed run history
  archive-only. Before update line counts were AGENTS 193, STATUS 121, CURRENT
  231.

## Remote Handoff Acceptance Coverage

- Applicability: no.
- Reason: no Draft PR, PR feedback, provider, merge, push, or remote landing
  behavior is in scope.
