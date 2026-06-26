# Review: workbench-local-loop-scheduler-handoff-boundary-scout-v1

Status: completed / ready to close.

## Findings

No unresolved correctness findings.

Resolved findings:

- Workbench `decisionInspector.primary` could lag behind the authoritative
  `confirmationQueue.primary` after scheduler worker progression reached a
  ready IntegrationCheck candidate. Fixed by aligning the inspector with the
  manual `planning.scheduler.integration-check.run` queue item.
- Goal Loop helper actions could expose `完全访问权限` on a terminal/manual
  IntegrationCheck gate. Fixed by treating helper actions whose
  `goalLoopCurrentGateActionType` is terminal/manual as ineligible for scoped
  automation wrapping.

## Verification

- `npx vitest run tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
  passed, 96 tests.
- `npx vitest run tests/unit/goal-loop-runtime.test.ts tests/unit/automation-runtime.test.ts tests/unit/action-revalidation.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx`
  passed, 135 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed, 58 files / 569 tests.
- `npm run build`: passed.
- `npm run test:workbench`: passed, 9 files / 138 tests.

Selected scope rationale: this change touched Workbench confirmation/read-model,
DecisionPanels scoped automation eligibility, and frontend decision action
typing, so targeted read-model/DOM/action-revalidation/Goal Loop/automation
tests plus the daily Workbench aggregate were required and sufficient.

## Complexity Deletion Review

- delete: removed no code paths; the existing stale inspector behavior was
  corrected in place.
- reuse: reused confirmation queue as the authoritative executable surface,
  decision inspector alignment owner, DecisionPanels automation eligibility,
  existing scoped automation runtime, current-gate revalidation, and controlled
  scheduler wrapper.
- yagni: avoided central workflow DB, raw scheduler full-access allowlist,
  second permission system, workflow runtime, projection framework, and new
  evidence family.
- shrink: fixed the root UI/projection decision with two narrow guards rather
  than adding a scheduler-specific UI state machine.
- net: Lean already; net code increase is bounded to tests plus two existing
  owner guards.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: yes for worker progression evidence already
  produced in the E-drive sandbox; no fake Codex, mocked PATH, fixture result,
  or hand-written artifact was used for the real UI scout evidence.
- Workbench URL: `http://127.0.0.1:4332/`.
- External source: `E:\aho-accept\local-loop-scheduler-handoff-v1\src`.
- Runtime home: `E:\aho-accept\local-loop-scheduler-handoff-v1\home`.
- Request-approval result: after plan confirmation with `请求批准`, Workbench
  stopped at the real decomposition primary gate and did not auto-dispatch.
- Full-access scheduler result: after manual scheduler preparation/direction
  confirmation, scoped automation consumed only the supported controlled
  scheduler path and produced two same-Change worker outputs.
- Integration candidate:
  `scheduler-integration-candidate-14264028`, status `ready`.
- Final UI after fixes: visible primary gate is manual
  `planning.scheduler.integration-check.run` / `检查组合结果`; `完全访问权限`
  is not shown on that terminal/manual gate.
- Source safety: external source `git status --short` remained empty; no
  automatic IntegrationCheck, integration apply/discard, PR, remote, merge, or
  Harness evolution occurred.

## Documentation Entropy Coverage

- Applicable: yes, close/handoff only.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Decision: keep run ids and E-drive paths archive-only; current docs should
  mention only the latest baseline and next recommended product direction.

## Workbench User-Surface Honesty Coverage

- Applicable: yes.
- Checked scope: request-approval scheduler-ready handoff, full-access
  controlled scheduler handoff, manual IntegrationCheck terminal gate.
- Visible primary UI backed by implemented workflow paths: yes.
- Authoritative primary-surface alignment checked: yes,
  `confirmationQueue.primary` and `decisionInspector.primary` both surface
  manual `planning.scheduler.integration-check.run`.
- Out-of-scope future capability check: UI does not show fake full-auto,
  full parallel executor, merge queue, PR/remote automation, or raw scheduler
  automation.
- Real browser UI verification: passed on E-drive sandbox.

## Scoped Workbench Action Payload Coverage

- Applicable: yes.
- Checked target ids: `changeId`, `schedulerRunId`,
  `schedulerIntegrationCandidateId`, `worktreeIds`, validation/audit run ids.
- Result: raw `planning.scheduler.*` and manual IntegrationCheck are not
  consumed by `完全访问权限`; the supported handoff uses the existing controlled
  scheduler wrapper.

## Source Apply Safety Coverage

- Applicable: yes.
- Checked source project: E-drive external sandbox.
- Source-root mutation gate checked: yes; source stayed clean and no apply,
  integration apply/discard, remote, merge, or Harness evolution ran.

## Runtime Bridge Boundary Coverage

- Applicable: yes.
- Boundary checked: Workbench SQLite is interaction/decision/projection store;
  Change, scheduler, validation, audit, apply/close artifacts remain workflow
  truth.
- Result: no central workflow DB was added or needed for this scout.

## Proposal / Runtime Boundary Coverage

- Applicable: yes.
- Artifact authority classification: Goal Loop packet/controller/preflight
  remain guidance/evidence; they can assist matching concrete gates but cannot
  authorize terminal/manual actions.
- Result: terminal/manual IntegrationCheck stayed human-gated.

## Goal Loop Boundary Coverage

- Applicable: yes.
- Checked persistent Change scope: same selected Change throughout worker
  progression and integration candidate.
- Recommendation authority checked: Goal Loop helper actions cannot become
  full-access authority when the concrete current gate is terminal/manual.
- ToolPolicy/human gate preservation checked: yes.

## Module Boundary Coverage

- Applicable: yes.
- Module owners checked: `src/workbench/projections/read-model/decision-inspector.ts`,
  `src/web/src/panels/workbench/DecisionPanels.tsx`, `src/web/src/types.ts`.
- Retained facade responsibilities: no broad facade logic added.
- Compatibility result: no external CLI/API contract change; snapshot payload
  only received existing typed frontend field coverage.

## Core Mechanism Reuse Coverage

- Applicable: yes.
- Existing mechanisms reused or strengthened: confirmation queue primary gate,
  decision inspector alignment, scoped automation eligibility, current-gate
  revalidation, controlled scheduler wrapper, artifact-first scheduler
  evidence.
- New cross-cutting mechanism: none.
- Future-cost result: future local loop work can rely on controlled scheduler
  wrapper without a new workflow DB or raw scheduler full-access allowlist.

## Close / Handoff Drift Coverage

- Applicable: yes.
- Handoff files to update during closeout: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Pending evolution state checked: no pending evolution at start of change.

## Remote Handoff Acceptance Coverage

- Applicable: no.
- Reason: PR, remote, merge, push, and remote landing were explicitly out of
  scope and were not automatically executed.
